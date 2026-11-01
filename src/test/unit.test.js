import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticate, authorize, orderAccess, signToken } from "../auth.js";
import { env } from "../config.js";
import { AppError, errorHandler, notFound } from "../errors.js";
import { Customer, Order, OrderItem, Staff } from "../models.js";
import { checkId, objectId, validate } from "../validate.js";

// UNIT tests: one small piece of logic at a time, called directly with fake request, response
// and next objects. No HTTP, no database. They run in milliseconds and pinpoint a failure.
// (The integration tests in the other files call the real app through HTTP instead.)

const fakeRes = () => {
  const res = { statusCode: undefined, body: undefined, locals: {} };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};

// next(err) is how Express middleware reports a failure: grab the error that was passed
const errorFrom = async (fn) => {
  const next = vi.fn();
  await fn(next);
  return { next, error: next.mock.calls[0]?.[0] };
};

const newId = () => new mongoose.Types.ObjectId();

// Runs a document's schema rules (no database needed) and returns the error, or undefined if valid
const validationError = async (doc) => {
  try {
    await doc.validate();
  } catch (error) {
    return error;
  }
  return undefined;
};

afterEach(() => vi.restoreAllMocks());

describe("validate(): body and query checking", () => {
  const schema = z.object({ email: z.string().trim().toLowerCase(), age: z.coerce.number().int().min(1).default(18) }).strict();

  it("passes a good body on and REPLACES it with the cleaned data", () => {
    const req = { body: { email: "  Ada@Example.COM ", age: "30" } };
    const next = vi.fn();

    validate(schema)(req, fakeRes(), next);

    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(req.body).toEqual({ email: "ada@example.com", age: 30 });
  });

  it("a missing body is treated as an empty object", async () => {
    const { error } = await errorFrom((next) => validate(z.object({ name: z.string() }))({}, fakeRes(), next));

    expect(error).toBeInstanceOf(AppError);
    expect(error.details[0].field).toBe("name");
  });

  it("a failure is a 400 VALIDATION_ERROR AppError listing each bad field", async () => {
    const { error } = await errorFrom((next) => validate(schema)({ body: { email: 5, age: 0 } }, fakeRes(), next));

    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Request body is invalid");
    expect(error.details.map((d) => d.field).sort()).toEqual(["age", "email"]);
  });

  it("unknown fields are rejected (strict schemas), reported under (body)", async () => {
    const { error } = await errorFrom((next) => validate(schema)({ body: { email: "a@b.co", extra: 1 } }, fakeRes(), next));

    expect(error.status).toBe(400);
    expect(error.details[0].field).toBe("(body)");
  });

  it("query mode: cleaned data goes to res.locals.query and req.query is left alone", () => {
    const req = { query: { age: "7" } };
    const res = fakeRes();
    const next = vi.fn();

    validate(z.object({ age: z.coerce.number() }), "query")(req, res, next);

    expect(res.locals.query).toEqual({ age: 7 });
    expect(req.query).toEqual({ age: "7" });
    expect(next).toHaveBeenCalledWith();
  });

  it("query mode: a failure says 'Query parameters are invalid'", async () => {
    const { error } = await errorFrom((next) =>
      validate(z.object({ page: z.coerce.number().min(1) }).strict(), "query")({ query: { page: "0" } }, fakeRes(), next)
    );

    expect(error.message).toBe("Query parameters are invalid");
  });
});

describe("checkId(): ids in the URL", () => {
  it.each([
    ["24 lowercase hex characters", "665f1c2e8a1b2c3d4e5f6b10"],
    ["24 uppercase hex characters", "665F1C2E8A1B2C3D4E5F6B10"],
    ["the all-zero id", "000000000000000000000000"],
  ])("accepts %s", (_label, id) => {
    const next = vi.fn();

    checkId({}, {}, next, id, "id");

    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ["23 characters", "665f1c2e8a1b2c3d4e5f6b1"],
    ["25 characters", "665f1c2e8a1b2c3d4e5f6b100"],
    ["non-hex letters", "zzzf1c2e8a1b2c3d4e5f6b10"],
    ["an empty string", ""],
    ["an id with a space", "665f1c2e8a1b2c3d4e5f6b1 "],
    ["a MongoDB operator", "$ne"],
  ])("rejects %s with a 400 naming the parameter", (_label, id) => {
    const next = vi.fn();

    checkId({}, {}, next, id, "itemId");

    const error = next.mock.calls[0][0];
    expect(error.status).toBe(400);
    expect(error.details).toEqual([{ field: "itemId", issue: "must be a 24-character hex id" }]);
  });

  it("the objectId rule used inside bodies behaves the same way", () => {
    expect(objectId.safeParse("665f1c2e8a1b2c3d4e5f6b10").success).toBe(true);
    expect(objectId.safeParse("abc").success).toBe(false);
    expect(objectId.safeParse({ $gt: "" }).success).toBe(false);
  });
});

describe("errorHandler(): every failure leaves in one shape", () => {
  it("an AppError keeps its status, code and message; details only when given", () => {
    const plain = fakeRes();
    errorHandler(new AppError(404, "ORDER_NOT_FOUND", "Order not found"), {}, plain, vi.fn());
    const detailed = fakeRes();
    errorHandler(new AppError(400, "VALIDATION_ERROR", "bad", [{ field: "x", issue: "y" }]), {}, detailed, vi.fn());

    expect(plain.statusCode).toBe(404);
    expect(plain.body).toEqual({ error: { code: "ORDER_NOT_FOUND", message: "Order not found" } });
    expect(detailed.body.error.details).toEqual([{ field: "x", issue: "y" }]);
  });

  it("malformed JSON from the body parser -> 400 INVALID_JSON", () => {
    const res = fakeRes();
    errorHandler(Object.assign(new SyntaxError("Unexpected token"), { type: "entity.parse.failed" }), {}, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("a body over the size limit -> 413 PAYLOAD_TOO_LARGE", () => {
    const res = fakeRes();
    errorHandler(Object.assign(new Error("too large"), { type: "entity.too.large" }), {}, res, vi.fn());

    expect(res.statusCode).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("a MongoDB duplicate-key error (11000) -> 409 DUPLICATE_RECORD naming the field", () => {
    const res = fakeRes();
    errorHandler(Object.assign(new Error("E11000 duplicate key"), { code: 11000, keyPattern: { phone: 1 } }), {}, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual({
      code: "DUPLICATE_RECORD",
      message: "A record with this phone already exists",
      details: [{ field: "phone", issue: "must be unique" }],
    });
  });

  it("a duplicate-key error with no keyPattern still gives a clean 409", () => {
    const res = fakeRes();
    errorHandler(Object.assign(new Error("E11000"), { code: 11000 }), {}, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.error.details[0].field).toBe("value");
  });

  it("anything unexpected -> generic 500 that leaks nothing, and is logged on the server", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = new Error("connect ECONNREFUSED 10.0.0.5:27017 password=hunter2");
    const res = fakeRes();

    errorHandler(secret, {}, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.5|stack/);
    expect(log).toHaveBeenCalledWith(secret);
  });

  it("notFound() names the method and path in a 404 AppError", () => {
    const next = vi.fn();

    notFound({ method: "GET", path: "/nope" }, {}, next);

    const error = next.mock.calls[0][0];
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(error.message).toBe("Route GET /nope not found");
  });
});

describe("signToken() and authenticate(): who are you?", () => {
  const staffLike = () => ({ id: newId().toString(), role: "owner" });

  it("signToken puts only the id and role in the token, and it expires in 1 hour", () => {
    const staff = staffLike();

    const payload = jwt.decode(signToken(staff));

    expect(payload.sub).toBe(staff.id);
    expect(payload.role).toBe("owner");
    expect(payload.exp - payload.iat).toBe(3600);
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "role", "sub"]);
  });

  it.each([
    ["no Authorization header", undefined],
    ["a header that is not Bearer", "Basic dXNlcjpwYXNz"],
    ["Bearer with no token", "Bearer"],
    ["a garbage token", "Bearer not-a-real-token"],
    ["a token signed with a different secret", `Bearer ${jwt.sign({ sub: "x" }, "another-secret-that-is-long-enough-123")}`],
    ["an expired token", `Bearer ${jwt.sign({ sub: "x" }, env.JWT_SECRET, { expiresIn: -10 })}`],
    ["an unsigned token (alg none)", `Bearer ${jwt.sign({ sub: "x" }, "", { algorithm: "none" })}`],
  ])("rejects %s with 401, before touching the database", async (_label, header) => {
    const lookup = vi.spyOn(Staff, "findById");
    const req = { headers: header === undefined ? {} : { authorization: header } };

    const { error } = await errorFrom((next) => authenticate(req, fakeRes(), next));

    expect(error).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(lookup).not.toHaveBeenCalled();
    expect(req.staff).toBeUndefined();
  });

  it("a good token for an account that no longer exists -> 401", async () => {
    vi.spyOn(Staff, "findById").mockResolvedValue(null);
    const req = { headers: { authorization: `Bearer ${signToken(staffLike())}` } };

    const { error } = await errorFrom((next) => authenticate(req, fakeRes(), next));

    expect(error).toMatchObject({ status: 401, message: "Account no longer exists" });
  });

  it("a good token for a real account sets req.staff and calls next() with no error", async () => {
    const staff = { id: newId().toString(), role: "staff", name: "Ada" };
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const req = { headers: { authorization: `Bearer ${signToken(staff)}` } };

    const { next } = await errorFrom((n) => authenticate(req, fakeRes(), n));

    expect(next).toHaveBeenCalledWith();
    expect(req.staff).toBe(staff);
  });
});

describe("authorize(): is your ROLE allowed?", () => {
  it.each([
    [["owner"], "owner", true],
    [["owner"], "staff", false],
    [["owner", "staff"], "staff", true],
    [["staff"], "owner", false],
  ])("authorize(%j) with role %s -> allowed: %s", (roles, role, allowed) => {
    const next = vi.fn();

    authorize(...roles)({ staff: { role } }, fakeRes(), next);

    if (allowed) expect(next).toHaveBeenCalledWith();
    else expect(next.mock.calls[0][0]).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});

describe("orderAccess(): may you CHANGE this order? (the ownership rule)", () => {
  const run = async (order, staff) => {
    vi.spyOn(Order, "findById").mockResolvedValue(order);
    const req = { params: { id: "x" }, staff };
    const { next, error } = await errorFrom((n) => orderAccess(req, fakeRes(), n));
    return { req, next, error };
  };
  const owner = { _id: newId(), role: "owner" };
  const handler = { _id: newId(), role: "staff" };
  const stranger = { _id: newId(), role: "staff" };

  it("the handler is allowed, and the loaded order is passed on in req.order", async () => {
    const order = { handledBy: handler._id };

    const { req, next } = await run(order, handler);

    expect(next).toHaveBeenCalledWith();
    expect(req.order).toBe(order);
  });

  it("an owner is allowed on any order", async () => {
    const { next } = await run({ handledBy: handler._id }, owner);

    expect(next).toHaveBeenCalledWith();
  });

  it("a different staff member -> 403", async () => {
    const { error } = await run({ handledBy: handler._id }, stranger);

    expect(error).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("an order with no handler: staff -> 403, owner -> allowed", async () => {
    const asStaff = await run({ handledBy: null }, handler);
    const asOwner = await run({ handledBy: null }, owner);

    expect(asStaff.error).toMatchObject({ status: 403 });
    expect(asOwner.next).toHaveBeenCalledWith();
  });

  it("an order that does not exist -> 404, decided before any permission check", async () => {
    const { error } = await run(null, stranger);

    expect(error).toMatchObject({ status: 404, code: "ORDER_NOT_FOUND" });
  });
});

describe("models: rules that need no database", () => {
  it("a Staff JSON never contains the password hash, and shows id instead of _id", () => {
    const json = new Staff({ name: "Ada", email: "ADA@Example.com", passwordHash: "$2b$12$abc", role: "owner" }).toJSON();

    expect(json.passwordHash).toBeUndefined();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.id).toMatch(/^[a-f0-9]{24}$/);
    expect(json.email).toBe("ada@example.com");
  });

  it("a new Order starts as 'received' with no handler, and dueDate prints as YYYY-MM-DD", () => {
    const json = new Order({ customerId: newId(), dueDate: new Date("2030-03-05T00:00:00Z") }).toJSON();

    expect(json.status).toBe("received");
    expect(json.handledBy).toBeNull();
    expect(json.dueDate).toBe("2030-03-05");
    expect(new Order({ customerId: newId() }).toJSON().dueDate).toBeNull();
  });

  it("an Order rejects a status that is not one of the five", async () => {
    const error = await validationError(new Order({ customerId: newId(), status: "shipped" }));

    expect(error.errors.status).toBeDefined();
  });

  it.each([
    [1, true],
    [1000, true],
    [0, false],
    [-3, false],
    [1001, false],
    [1.5, false],
  ])("an OrderItem with quantity %s is valid: %s", async (quantity, valid) => {
    const error = await validationError(new OrderItem({ orderId: newId(), garmentTypeId: newId(), size: "L", color: "black", quantity }));

    expect(error === undefined).toBe(valid);
  });

  it("an OrderItem designNote is capped at 300 characters", async () => {
    const base = { orderId: newId(), garmentTypeId: newId(), size: "L", color: "black", quantity: 1 };

    expect(await validationError(new OrderItem({ ...base, designNote: "x".repeat(300) }))).toBeUndefined();
    expect((await validationError(new OrderItem({ ...base, designNote: "x".repeat(301) }))).errors.designNote).toBeDefined();
  });

  it("a Customer's email is stored lowercase and the phone is trimmed", () => {
    const customer = new Customer({ name: "Ada", phone: "  +2348012345678 ", email: "ADA@EXAMPLE.COM" });

    expect(customer.email).toBe("ada@example.com");
    expect(customer.phone).toBe("+2348012345678");
  });
});
