import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../app.js";
import { OrderItem } from "../models.js";
import { MISSING_ID, bearer, makeGarment, makeItem, makeOrder, makeStaff } from "./helpers.js";

// Every test here needs the same cast of characters, so beforeEach builds them fresh.
// (The database is emptied before each test by test/setup.js, which runs first.)
let handler, handlerToken, strangerToken, ownerToken, garment, order, validBody;

beforeEach(async () => {
  ({ staff: handler, token: handlerToken } = await makeStaff("staff"));
  ({ token: strangerToken } = await makeStaff("staff"));
  ({ token: ownerToken } = await makeStaff("owner"));
  garment = await makeGarment({ name: "Hoodie", availableSizes: ["S", "M", "L"], availableColors: ["black", "grey"] });
  order = await makeOrder({ handledBy: handler._id });
  validBody = { garmentTypeId: garment.id, size: "L", color: "black", quantity: 12, designNote: "Logo on the chest" };
});

describe("POST /orders/:id/items", () => {
  it("the handler adds an item (201)", async () => {
    const res = await request(app).post(`/orders/${order.id}/items`).set(bearer(handlerToken)).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      orderId: order.id,
      garmentTypeId: garment.id,
      size: "L",
      color: "black",
      quantity: 12,
      designNote: "Logo on the chest",
    });
    expect(await OrderItem.countDocuments({ orderId: order._id })).toBe(1);
  });

  it("designNote is optional (null)", async () => {
    const { designNote, ...withoutNote } = validBody;

    const res = await request(app).post(`/orders/${order.id}/items`).set(bearer(handlerToken)).send(withoutNote);

    expect(res.status).toBe(201);
    expect(res.body.designNote).toBeNull();
  });

  it("an owner can add to any order", async () => {
    const res = await request(app).post(`/orders/${order.id}/items`).set(bearer(ownerToken)).send(validBody);

    expect(res.status).toBe(201);
  });

  it("a different staff member -> 403 FORBIDDEN, nothing added", async () => {
    const res = await request(app).post(`/orders/${order.id}/items`).set(bearer(strangerToken)).send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await OrderItem.countDocuments()).toBe(0);
  });

  it("an order with no handler: staff -> 403", async () => {
    const unhandled = await makeOrder({ handledBy: null });

    const res = await request(app).post(`/orders/${unhandled.id}/items`).set(bearer(handlerToken)).send(validBody);

    expect(res.status).toBe(403);
  });

  it("403 is decided BEFORE the body is checked", async () => {
    const res = await request(app).post(`/orders/${order.id}/items`).set(bearer(strangerToken)).send({ nonsense: true });

    expect(res.status).toBe(403);
  });

  it("order that does not exist -> 404 ORDER_NOT_FOUND", async () => {
    const res = await request(app).post(`/orders/${MISSING_ID}/items`).set(bearer(handlerToken)).send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("malformed order id -> 400", async () => {
    const res = await request(app).post("/orders/nope/items").set(bearer(handlerToken)).send(validBody);

    expect(res.status).toBe(400);
  });

  it("garment type that does not exist -> 400 pointing at garmentTypeId", async () => {
    const res = await request(app)
      .post(`/orders/${order.id}/items`)
      .set(bearer(handlerToken))
      .send({ ...validBody, garmentTypeId: MISSING_ID });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("garmentTypeId");
  });

  it("a size the garment doesn't offer -> 400, and the message lists the valid ones", async () => {
    const res = await request(app)
      .post(`/orders/${order.id}/items`)
      .set(bearer(handlerToken))
      .send({ ...validBody, size: "XXL" });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("size");
    expect(res.body.error.details[0].issue).toContain("S, M, L");
  });

  it("sizes must match exactly: 'l' is not 'L'", async () => {
    const res = await request(app)
      .post(`/orders/${order.id}/items`)
      .set(bearer(handlerToken))
      .send({ ...validBody, size: "l" });

    expect(res.status).toBe(400);
  });

  it("a colour the garment doesn't offer -> 400", async () => {
    const res = await request(app)
      .post(`/orders/${order.id}/items`)
      .set(bearer(handlerToken))
      .send({ ...validBody, color: "red" });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("color");
  });

  it.each([
    ["quantity 0", { quantity: 0 }],
    ["quantity -1", { quantity: -1 }],
    ["quantity 1.5 (must be whole)", { quantity: 1.5 }],
    ["quantity 1001", { quantity: 1001 }],
    ["quantity sent as text", { quantity: "5" }],
    ["designNote over 300 characters", { designNote: "x".repeat(301) }],
    ["an unknown field (price)", { price: 5000 }],
    ["garmentTypeId malformed", { garmentTypeId: "abc" }],
  ])("%s -> 400", async (_label, change) => {
    const res = await request(app)
      .post(`/orders/${order.id}/items`)
      .set(bearer(handlerToken))
      .send({ ...validBody, ...change });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await OrderItem.countDocuments()).toBe(0);
  });

  it("required fields missing -> 400", async () => {
    const res = await request(app)
      .post(`/orders/${order.id}/items`)
      .set(bearer(handlerToken))
      .send({ designNote: "nothing else" });

    expect(res.status).toBe(400);
  });

  it("the same garment, size and colour twice -> 409 DUPLICATE_ITEM", async () => {
    await request(app).post(`/orders/${order.id}/items`).set(bearer(handlerToken)).send(validBody);

    const res = await request(app)
      .post(`/orders/${order.id}/items`)
      .set(bearer(handlerToken))
      .send({ ...validBody, quantity: 99 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_ITEM");
    expect(await OrderItem.countDocuments()).toBe(1);
  });

  it("changing the size OR the colour makes it a different item (201)", async () => {
    await request(app).post(`/orders/${order.id}/items`).set(bearer(handlerToken)).send(validBody);

    const otherSize = await request(app).post(`/orders/${order.id}/items`).set(bearer(handlerToken)).send({ ...validBody, size: "M" });
    const otherColor = await request(app).post(`/orders/${order.id}/items`).set(bearer(handlerToken)).send({ ...validBody, color: "grey" });

    expect(otherSize.status).toBe(201);
    expect(otherColor.status).toBe(201);
    expect(await OrderItem.countDocuments()).toBe(3);
  });

  it("the same item on a DIFFERENT order is fine (201)", async () => {
    const secondOrder = await makeOrder({ handledBy: handler._id });
    await request(app).post(`/orders/${order.id}/items`).set(bearer(handlerToken)).send(validBody);

    const res = await request(app).post(`/orders/${secondOrder.id}/items`).set(bearer(handlerToken)).send(validBody);

    expect(res.status).toBe(201);
  });
});

describe("GET /orders/:id/items", () => {
  it("any logged-in staff can read the items, oldest first (200)", async () => {
    const first = await makeItem({ order, garment, size: "S" });
    const second = await makeItem({ order, garment, size: "M" });

    const res = await request(app).get(`/orders/${order.id}/items`).set(bearer(strangerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.map((i) => i.id)).toEqual([first.id, second.id]);
  });

  it("an order with no items -> 200 with an empty list", async () => {
    const res = await request(app).get(`/orders/${order.id}/items`).set(bearer(strangerToken));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it("only returns this order's items", async () => {
    const otherOrder = await makeOrder({ handledBy: handler._id });
    await makeItem({ order: otherOrder });
    const mine = await makeItem({ order, garment });

    const res = await request(app).get(`/orders/${order.id}/items`).set(bearer(handlerToken));

    expect(res.body.data.map((i) => i.id)).toEqual([mine.id]);
  });

  it("order that does not exist -> 404", async () => {
    const res = await request(app).get(`/orders/${MISSING_ID}/items`).set(bearer(handlerToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("malformed order id -> 400", async () => {
    const res = await request(app).get("/orders/not-a-real-id/items").set(bearer(handlerToken));

    expect(res.status).toBe(400);
  });
});

describe("DELETE /orders/:id/items/:itemId", () => {
  it("the handler deletes an item (200), and a second delete is a 404", async () => {
    const item = await makeItem({ order, garment });

    const res = await request(app).delete(`/orders/${order.id}/items/${item.id}`).set(bearer(handlerToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Item deleted", id: item.id });
    expect(await OrderItem.exists({ _id: item._id })).toBeNull();

    const again = await request(app).delete(`/orders/${order.id}/items/${item.id}`).set(bearer(handlerToken));
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe("ITEM_NOT_FOUND");
  });

  it("a different staff member -> 403, and the item stays", async () => {
    const item = await makeItem({ order, garment });

    const res = await request(app).delete(`/orders/${order.id}/items/${item.id}`).set(bearer(strangerToken));

    expect(res.status).toBe(403);
    expect(await OrderItem.exists({ _id: item._id })).not.toBeNull();
  });

  it("an owner can delete any order's item", async () => {
    const item = await makeItem({ order, garment });

    const res = await request(app).delete(`/orders/${order.id}/items/${item.id}`).set(bearer(ownerToken));

    expect(res.status).toBe(200);
  });

  it("an item id used with the WRONG order in the path -> 404 ITEM_NOT_FOUND, item untouched", async () => {
    const item = await makeItem({ order, garment });
    const otherOrder = await makeOrder({ handledBy: handler._id });

    const res = await request(app).delete(`/orders/${otherOrder.id}/items/${item.id}`).set(bearer(ownerToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ITEM_NOT_FOUND");
    expect(await OrderItem.exists({ _id: item._id })).not.toBeNull();
  });

  it("order that does not exist -> 404 ORDER_NOT_FOUND", async () => {
    const res = await request(app).delete(`/orders/${MISSING_ID}/items/${MISSING_ID}`).set(bearer(ownerToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("malformed itemId -> 400", async () => {
    const res = await request(app).delete(`/orders/${order.id}/items/not-a-real-id`).set(bearer(ownerToken));

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("itemId");
  });

  it("malformed order id -> 400", async () => {
    const res = await request(app).delete(`/orders/nope/items/${MISSING_ID}`).set(bearer(ownerToken));

    expect(res.status).toBe(400);
  });
});
