import bcrypt from "bcryptjs";
import { Customer, GarmentType, Order, OrderItem, Staff } from "../models.js";
import { signToken } from "../auth.js";

// A well-formed id that matches nothing: for "valid but does not exist" (404) cases
export const MISSING_ID = "000000000000000000000000";

export const PASSWORD = "test-password-123";

let counter = 0;
const next = () => ++counter;

// "Authorization: Bearer <token>" as an object, for supertest's .set()
export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// ---------- factories: put rows straight into the database ----------
// Tests should set up their data with the models, NOT by calling the API.
// Then a bug in POST /orders can't break a test that is really about PATCH /orders.

// Returns { staff, token }. The token is made directly, so no login request is needed.
export async function makeStaff(role = "staff", overrides = {}) {
  const n = next();
  const staff = await Staff.create({
    name: `Test ${role} ${n}`,
    email: `${role}.${n}@example.com`,
    passwordHash: await bcrypt.hash(PASSWORD, 4), // low cost = fast tests (the app uses 12)
    role,
    ...overrides,
  });
  return { staff, token: signToken(staff) };
}

export async function makeCustomer(overrides = {}) {
  const n = next();
  return Customer.create({
    name: `Test Customer ${n}`,
    phone: `+234000${String(n).padStart(7, "0")}`,
    ...overrides,
  });
}

export async function makeGarment(overrides = {}) {
  const n = next();
  return GarmentType.create({
    name: `Garment ${n}`,
    category: "tops",
    availableSizes: ["S", "M", "L"],
    availableColors: ["black", "grey"],
    ...overrides,
  });
}

// handledBy: pass a staff _id, or leave it out for an unhandled (owner-only) order
export async function makeOrder({ customer, handledBy = null, ...overrides } = {}) {
  const owningCustomer = customer ?? (await makeCustomer());
  return Order.create({ customerId: owningCustomer._id, handledBy, ...overrides });
}

export async function makeItem({ order, garment, ...overrides } = {}) {
  const g = garment ?? (await makeGarment());
  return OrderItem.create({
    orderId: order._id,
    garmentTypeId: g._id,
    size: "M",
    color: "black",
    quantity: 5,
    ...overrides,
  });
}
