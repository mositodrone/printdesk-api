import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";
import { Customer } from "../models.js";
import { MISSING_ID, bearer, makeCustomer, makeOrder, makeStaff } from "./helpers.js";

describe("POST /customers", () => {
  it("any logged-in staff can create a customer (201)", async () => {
    const { token } = await makeStaff("staff");

    const res = await request(app)
      .post("/customers")
      .set(bearer(token))
      .send({ name: "Test Customer", phone: "+2348012345678", email: "test@example.com" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Test Customer", phone: "+2348012345678", email: "test@example.com" });
    expect(res.body.id).toMatch(/^[a-f0-9]{24}$/);
    expect(await Customer.countDocuments()).toBe(1);
  });

  it("email is optional and comes back as null", async () => {
    const { token } = await makeStaff();

    const res = await request(app).post("/customers").set(bearer(token)).send({ name: "No Email", phone: "(0803) 123-4567" });

    expect(res.status).toBe(201);
    expect(res.body.email).toBeNull();
  });

  it("needs a login", async () => {
    const res = await request(app).post("/customers").send({ name: "x", phone: "+2348012345678" });

    expect(res.status).toBe(401);
  });

  it.each([
    ["phone with letters", { name: "A", phone: "not-a-phone" }],
    ["phone too short", { name: "A", phone: "12345" }],
    ["name missing", { phone: "+2348099999999" }],
    ["name blank", { name: "   ", phone: "+2348099999999" }],
    ["invalid email", { name: "A", phone: "+2348099999999", email: "not-an-email" }],
    ["email null (not allowed)", { name: "A", phone: "+2348099999999", email: null }],
    ["unknown field", { name: "A", phone: "+2348099999999", vip: true }],
  ])("%s -> 400", async (_label, body) => {
    const { token } = await makeStaff();

    const res = await request(app).post("/customers").set(bearer(token)).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await Customer.countDocuments()).toBe(0);
  });

  it("same phone twice -> 409 DUPLICATE_RECORD", async () => {
    const { token } = await makeStaff();
    const existing = await makeCustomer();

    const res = await request(app).post("/customers").set(bearer(token)).send({ name: "Copy", phone: existing.phone });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_RECORD");
    expect(res.body.error.details[0].field).toBe("phone");
  });
});

describe("GET /customers/:id", () => {
  it("returns the customer (200)", async () => {
    const { token } = await makeStaff();
    const customer = await makeCustomer({ name: "Ada" });

    const res = await request(app).get(`/customers/${customer.id}`).set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: customer.id, name: "Ada" });
  });

  it("valid id that matches nobody -> 404 CUSTOMER_NOT_FOUND", async () => {
    const { token } = await makeStaff();

    const res = await request(app).get(`/customers/${MISSING_ID}`).set(bearer(token));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("malformed id -> 400 (not 404 and not 500)", async () => {
    const { token } = await makeStaff();

    const res = await request(app).get("/customers/not-a-real-id").set(bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: "id", issue: "must be a 24-character hex id" }]);
  });
});

describe("GET /customers/:id/orders", () => {
  it("a customer with no orders -> empty list, totalPages 0", async () => {
    const { token } = await makeStaff();
    const customer = await makeCustomer();

    const res = await request(app).get(`/customers/${customer.id}/orders`).set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it("only returns THIS customer's orders", async () => {
    const { token } = await makeStaff();
    const mine = await makeCustomer();
    const other = await makeCustomer();
    await makeOrder({ customer: mine });
    await makeOrder({ customer: other });

    const res = await request(app).get(`/customers/${mine.id}/orders`).set(bearer(token));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].customerId).toBe(mine.id);
  });

  it("pages through results", async () => {
    const { token } = await makeStaff();
    const customer = await makeCustomer();
    await makeOrder({ customer });
    await makeOrder({ customer });
    await makeOrder({ customer });

    const page2 = await request(app).get(`/customers/${customer.id}/orders?page=2&limit=2`).set(bearer(token));

    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it.each([["page=0"], ["limit=101"], ["sort=name"], ["colour=red"]])("bad or unsupported query (%s) -> 400", async (query) => {
    const { token } = await makeStaff();
    const customer = await makeCustomer();

    const res = await request(app).get(`/customers/${customer.id}/orders?${query}`).set(bearer(token));

    expect(res.status).toBe(400);
  });

  it("customer that does not exist -> 404", async () => {
    const { token } = await makeStaff();

    const res = await request(app).get(`/customers/${MISSING_ID}/orders`).set(bearer(token));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
  });
});

describe("DELETE /customers/:id (owner only)", () => {
  it("staff -> 403, and the customer is still there", async () => {
    const { token } = await makeStaff("staff");
    const customer = await makeCustomer();

    const res = await request(app).delete(`/customers/${customer.id}`).set(bearer(token));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await Customer.exists({ _id: customer._id })).not.toBeNull();
  });

  it("staff get 403 even for a customer that doesn't exist (role is checked first)", async () => {
    const { token } = await makeStaff("staff");

    const res = await request(app).delete(`/customers/${MISSING_ID}`).set(bearer(token));

    expect(res.status).toBe(403);
  });

  it("owner + customer WITH orders -> 409 CUSTOMER_HAS_ORDERS, nothing deleted", async () => {
    const { token } = await makeStaff("owner");
    const customer = await makeCustomer();
    await makeOrder({ customer });

    const res = await request(app).delete(`/customers/${customer.id}`).set(bearer(token));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CUSTOMER_HAS_ORDERS");
    expect(await Customer.exists({ _id: customer._id })).not.toBeNull();
  });

  it("owner + customer with no orders -> 200, then it is gone (404)", async () => {
    const { token } = await makeStaff("owner");
    const customer = await makeCustomer();

    const res = await request(app).delete(`/customers/${customer.id}`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Customer deleted", id: customer.id });

    const again = await request(app).delete(`/customers/${customer.id}`).set(bearer(token));
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe("CUSTOMER_NOT_FOUND");

    const fetch = await request(app).get(`/customers/${customer.id}`).set(bearer(token));
    expect(fetch.status).toBe(404);
  });
});
