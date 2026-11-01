import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";
import { Order, OrderItem } from "../models.js";
import { MISSING_ID, bearer, makeCustomer, makeGarment, makeItem, makeOrder, makeStaff } from "./helpers.js";

// Dates in the tests use 2030 so "today or later" keeps passing for years.

describe("POST /orders", () => {
  it("creates an order: status is 'received' and handledBy is the logged-in staff member", async () => {
    const { staff, token } = await makeStaff();
    const customer = await makeCustomer();

    const res = await request(app)
      .post("/orders")
      .set(bearer(token))
      .send({ customerId: customer.id, dueDate: "2030-01-15", notes: "Church group event" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      customerId: customer.id,
      handledBy: staff.id,
      status: "received",
      dueDate: "2030-01-15",
      notes: "Church group event",
    });
    expect(res.headers.location).toBe(`/orders/${res.body.id}`);
    expect(await Order.countDocuments()).toBe(1);
  });

  it("dueDate and notes are optional (null)", async () => {
    const { token } = await makeStaff();
    const customer = await makeCustomer();

    const res = await request(app).post("/orders").set(bearer(token)).send({ customerId: customer.id });

    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBeNull();
    expect(res.body.notes).toBeNull();
  });

  it("needs a login", async () => {
    const res = await request(app).post("/orders").send({ customerId: MISSING_ID });

    expect(res.status).toBe(401);
  });

  it.each([
    ["customerId missing", () => ({ notes: "no customer" })],
    ["customerId malformed", () => ({ customerId: "abc" })],
    ["customerId matches no customer", () => ({ customerId: MISSING_ID })],
    ["due date in the past", (c) => ({ customerId: c.id, dueDate: "2020-01-01" })],
    ["due date not a real date", (c) => ({ customerId: c.id, dueDate: "2030-02-30" })],
    ["due date in the wrong format", (c) => ({ customerId: c.id, dueDate: "15/01/2030" })],
    ["notes over 500 characters", (c) => ({ customerId: c.id, notes: "x".repeat(501) })],
    ["unknown field", (c) => ({ customerId: c.id, priority: "high" })],
    ["handledBy in the body (it comes from the token)", (c) => ({ customerId: c.id, handledBy: MISSING_ID })],
    ["status in the body (it always starts as received)", (c) => ({ customerId: c.id, status: "ready" })],
  ])("%s -> 400", async (_label, makeBody) => {
    const { token } = await makeStaff();
    const customer = await makeCustomer();

    const res = await request(app).post("/orders").set(bearer(token)).send(makeBody(customer));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await Order.countDocuments()).toBe(0);
  });
});

describe("GET /orders", () => {
  it("empty database -> 200 with an empty list", async () => {
    const { token } = await makeStaff();

    const res = await request(app).get("/orders").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it("newest first by default", async () => {
    const { token } = await makeStaff();
    const first = await makeOrder();
    const second = await makeOrder();
    const third = await makeOrder();

    const res = await request(app).get("/orders").set(bearer(token));

    expect(res.body.data.map((o) => o.id)).toEqual([third.id, second.id, first.id]);
  });

  it("filters by status", async () => {
    const { token } = await makeStaff();
    await makeOrder({ status: "received" });
    const printing = await makeOrder({ status: "printing" });

    const res = await request(app).get("/orders?status=printing").set(bearer(token));

    expect(res.body.data.map((o) => o.id)).toEqual([printing.id]);
    expect(res.body.pagination.total).toBe(1);
  });

  it("filters by customerId", async () => {
    const { token } = await makeStaff();
    const mine = await makeCustomer();
    await makeOrder();
    const wanted = await makeOrder({ customer: mine });

    const res = await request(app).get(`/orders?customerId=${mine.id}`).set(bearer(token));

    expect(res.body.data.map((o) => o.id)).toEqual([wanted.id]);
  });

  it("sorts by dueDate, ascending and descending", async () => {
    const { token } = await makeStaff();
    const march = await makeOrder({ dueDate: new Date("2030-03-01") });
    const january = await makeOrder({ dueDate: new Date("2030-01-01") });
    const february = await makeOrder({ dueDate: new Date("2030-02-01") });

    const asc = await request(app).get("/orders?sort=dueDate").set(bearer(token));
    const desc = await request(app).get("/orders?sort=-dueDate").set(bearer(token));

    expect(asc.body.data.map((o) => o.id)).toEqual([january.id, february.id, march.id]);
    expect(desc.body.data.map((o) => o.id)).toEqual([march.id, february.id, january.id]);
  });

  it("pages: page 2 of limit 2 holds the 3rd order, and the totals are right", async () => {
    const { token } = await makeStaff();
    await makeOrder();
    await makeOrder();
    await makeOrder();

    const res = await request(app).get("/orders?page=2&limit=2").set(bearer(token));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it.each([
    ["status=shipped"],
    ["limit=500"],
    ["limit=0"],
    ["page=0"],
    ["page=abc"],
    ["sort=customerId"],
    ["customerId=abc"],
    ["colour=red"],
  ])("bad or unknown query (%s) -> 400", async (query) => {
    const { token } = await makeStaff();

    const res = await request(app).get(`/orders?${query}`).set(bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /orders/:id", () => {
  it("any logged-in staff can read any order (200)", async () => {
    const { staff } = await makeStaff();
    const { token: otherToken } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });

    const res = await request(app).get(`/orders/${order.id}`).set(bearer(otherToken));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
  });

  it("404 ORDER_NOT_FOUND for a valid id with no order", async () => {
    const { token } = await makeStaff();

    const res = await request(app).get(`/orders/${MISSING_ID}`).set(bearer(token));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("400 for a malformed id", async () => {
    const { token } = await makeStaff();

    const res = await request(app).get("/orders/not-a-real-id").set(bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /orders/:id (owner or handler)", () => {
  it("the handler can edit their own order (200)", async () => {
    const { staff, token } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });

    const res = await request(app)
      .patch(`/orders/${order.id}`)
      .set(bearer(token))
      .send({ dueDate: "2030-02-01", notes: "Moved back" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dueDate: "2030-02-01", notes: "Moved back" });
    expect((await Order.findById(order.id)).notes).toBe("Moved back");
  });

  it("a different staff member -> 403, and nothing changes", async () => {
    const { staff } = await makeStaff();
    const { token: strangerToken } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id, notes: "original" });

    const res = await request(app).patch(`/orders/${order.id}`).set(bearer(strangerToken)).send({ notes: "hacked" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect((await Order.findById(order.id)).notes).toBe("original");
  });

  it("an owner can edit any order", async () => {
    const { staff } = await makeStaff();
    const { token: ownerToken } = await makeStaff("owner");
    const order = await makeOrder({ handledBy: staff._id });

    const res = await request(app).patch(`/orders/${order.id}`).set(bearer(ownerToken)).send({ notes: "Edited by owner" });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Edited by owner");
  });

  it("an order with no handler: staff -> 403, owner -> 200", async () => {
    const { token: staffToken } = await makeStaff();
    const { token: ownerToken } = await makeStaff("owner");
    const order = await makeOrder({ handledBy: null });

    const asStaff = await request(app).patch(`/orders/${order.id}`).set(bearer(staffToken)).send({ notes: "x" });
    const asOwner = await request(app).patch(`/orders/${order.id}`).set(bearer(ownerToken)).send({ notes: "x" });

    expect(asStaff.status).toBe(403);
    expect(asOwner.status).toBe(200);
  });

  it("checks come in this order: 404 (no order) beats 403 (not yours)", async () => {
    const { token } = await makeStaff();

    const res = await request(app).patch(`/orders/${MISSING_ID}`).set(bearer(token)).send({ notes: "x" });

    expect(res.status).toBe(404);
  });

  it("...and 403 beats 400: a stranger sending a bad body is told 403, not what is wrong with it", async () => {
    const { staff } = await makeStaff();
    const { token: strangerToken } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });

    const res = await request(app).patch(`/orders/${order.id}`).set(bearer(strangerToken)).send({ nonsense: true });

    expect(res.status).toBe(403);
  });

  it("can clear dueDate and notes by sending null", async () => {
    const { staff, token } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id, dueDate: new Date("2030-01-01"), notes: "something" });

    const res = await request(app).patch(`/orders/${order.id}`).set(bearer(token)).send({ dueDate: null, notes: null });

    expect(res.status).toBe(200);
    expect(res.body.dueDate).toBeNull();
    expect(res.body.notes).toBeNull();
  });

  it("can move an order to another customer", async () => {
    const { staff, token } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });
    const newCustomer = await makeCustomer();

    const res = await request(app).patch(`/orders/${order.id}`).set(bearer(token)).send({ customerId: newCustomer.id });

    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(newCustomer.id);
  });

  it.each([
    ["empty body", () => ({})],
    ["status (it has its own endpoint)", () => ({ status: "ready" })],
    ["handledBy", () => ({ handledBy: MISSING_ID })],
    ["customerId that matches no customer", () => ({ customerId: MISSING_ID })],
    ["a due date that is not a real date", () => ({ dueDate: "2030-13-45" })],
    ["notes over 500 characters", () => ({ notes: "x".repeat(501) })],
  ])("%s -> 400", async (_label, makeBody) => {
    const { staff, token } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });

    const res = await request(app).patch(`/orders/${order.id}`).set(bearer(token)).send(makeBody());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /orders/:id/status (any logged-in staff)", () => {
  it("a staff member who does NOT handle the order can still move its status (200)", async () => {
    const { staff } = await makeStaff();
    const { token: otherToken } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });

    const res = await request(app).patch(`/orders/${order.id}/status`).set(bearer(otherToken)).send({ status: "printing" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("printing");
    expect((await Order.findById(order.id)).status).toBe("printing");
  });

  it("works on an order with no handler too (there is no 403 on this route)", async () => {
    const { token } = await makeStaff();
    const order = await makeOrder({ handledBy: null });

    const res = await request(app).patch(`/orders/${order.id}/status`).set(bearer(token)).send({ status: "ready" });

    expect(res.status).toBe(200);
  });

  it("any status can be set at any time, including going backwards", async () => {
    const { token } = await makeStaff();
    const order = await makeOrder({ status: "delivered" });

    const res = await request(app).patch(`/orders/${order.id}/status`).set(bearer(token)).send({ status: "received" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("received");
  });

  it.each([
    ["an unknown status", { status: "shipped" }],
    ["no status", {}],
    ["an extra field", { status: "ready", notes: "sneaky" }],
    ["a non-string status", { status: 3 }],
  ])("%s -> 400", async (_label, body) => {
    const { token } = await makeStaff();
    const order = await makeOrder();

    const res = await request(app).patch(`/orders/${order.id}/status`).set(bearer(token)).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("order that does not exist -> 404", async () => {
    const { token } = await makeStaff();

    const res = await request(app).patch(`/orders/${MISSING_ID}/status`).set(bearer(token)).send({ status: "ready" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("malformed id -> 400", async () => {
    const { token } = await makeStaff();

    const res = await request(app).patch("/orders/nope/status").set(bearer(token)).send({ status: "ready" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /orders/:id (owner or handler)", () => {
  it("the handler deletes their order and its items go with it (200)", async () => {
    const { staff, token } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });
    await makeItem({ order, size: "S" });
    await makeItem({ order, size: "M" });
    const otherOrder = await makeOrder({ handledBy: staff._id });
    await makeItem({ order: otherOrder });

    const res = await request(app).delete(`/orders/${order.id}`).set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Order deleted", id: order.id });
    expect(await Order.exists({ _id: order._id })).toBeNull();
    expect(await OrderItem.countDocuments({ orderId: order._id })).toBe(0);
    // ...but another order's items are untouched
    expect(await OrderItem.countDocuments({ orderId: otherOrder._id })).toBe(1);
  });

  it("a different staff member -> 403, and the order and its items remain", async () => {
    const { staff } = await makeStaff();
    const { token: strangerToken } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });
    await makeItem({ order });

    const res = await request(app).delete(`/orders/${order.id}`).set(bearer(strangerToken));

    expect(res.status).toBe(403);
    expect(await Order.exists({ _id: order._id })).not.toBeNull();
    expect(await OrderItem.countDocuments({ orderId: order._id })).toBe(1);
  });

  it("an owner can delete any order, even one with no handler", async () => {
    const { token } = await makeStaff("owner");
    const order = await makeOrder({ handledBy: null });

    const res = await request(app).delete(`/orders/${order.id}`).set(bearer(token));

    expect(res.status).toBe(200);
  });

  it("an order with no handler: staff -> 403", async () => {
    const { token } = await makeStaff();
    const order = await makeOrder({ handledBy: null });

    const res = await request(app).delete(`/orders/${order.id}`).set(bearer(token));

    expect(res.status).toBe(403);
  });

  it("deleting twice: the second time is a 404", async () => {
    const { staff, token } = await makeStaff();
    const order = await makeOrder({ handledBy: staff._id });

    await request(app).delete(`/orders/${order.id}`).set(bearer(token));
    const again = await request(app).delete(`/orders/${order.id}`).set(bearer(token));

    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("malformed id -> 400", async () => {
    const { token } = await makeStaff();

    const res = await request(app).delete("/orders/not-a-real-id").set(bearer(token));

    expect(res.status).toBe(400);
  });
});

// A test that walks the whole life of an order, like your .http files do.
// Fewer, bigger tests like this complement the small ones above; they don't replace them.
describe("the order lifecycle, end to end", () => {
  it("create -> add items -> move through statuses -> delete", async () => {
    const { token } = await makeStaff();
    const customer = await makeCustomer();
    const garment = await makeGarment({ availableSizes: ["L"], availableColors: ["black"] });

    const created = await request(app).post("/orders").set(bearer(token)).send({ customerId: customer.id });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const item = await request(app)
      .post(`/orders/${id}/items`)
      .set(bearer(token))
      .send({ garmentTypeId: garment.id, size: "L", color: "black", quantity: 12 });
    expect(item.status).toBe(201);

    for (const status of ["printing", "ready", "delivered"]) {
      const step = await request(app).patch(`/orders/${id}/status`).set(bearer(token)).send({ status });
      expect(step.body.status).toBe(status);
    }

    const items = await request(app).get(`/orders/${id}/items`).set(bearer(token));
    expect(items.body.data).toHaveLength(1);

    const removed = await request(app).delete(`/orders/${id}`).set(bearer(token));
    expect(removed.status).toBe(200);

    const gone = await request(app).get(`/orders/${id}`).set(bearer(token));
    expect(gone.status).toBe(404);
  });
});
