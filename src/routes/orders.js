import { Router } from "express";
import { z } from "zod";
import { Order, OrderItem, Customer, ORDER_STATUSES } from "../models.js";
import { validate, checkId, objectId } from "../validate.js";
import { orderAccess } from "../auth.js";
import { AppError } from "../errors.js";
import itemsRouter from "./items.js";

// ---------- what clients may send ----------
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format")
  .refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "must be a real calendar date");

const notes = z.string().max(500, "must be 500 characters or fewer");
const status = z.enum(ORDER_STATUSES, { error: `must be one of: ${ORDER_STATUSES.join(", ")}` });

// On create, the due date cannot be in the past (compared as UTC dates)
const futureDate = dateOnly.refine((s) => s >= new Date().toISOString().slice(0, 10), "must be today or later");

const createSchema = z
  .object({ customerId: objectId, dueDate: futureDate.optional(), notes: notes.optional() })
  .strict();

const updateSchema = z
  .object({ customerId: objectId.optional(), dueDate: dateOnly.nullable().optional(), notes: notes.nullable().optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "at least one field is required");

const statusSchema = z.object({ status }).strict();

const listSchema = z
  .object({
    status: status.optional(),
    customerId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(["createdAt", "-createdAt", "dueDate", "-dueDate"]).default("-createdAt"),
  })
  .strict();

// ---------- helpers ----------
const orderNotFound = () => new AppError(404, "ORDER_NOT_FOUND", "Order not found");

async function assertCustomerExists(customerId) {
  if (!(await Customer.exists({ _id: customerId }))) {
    throw new AppError(400, "VALIDATION_ERROR", "Request body is invalid", [
      { field: "customerId", issue: "customerId does not match an existing customer" },
    ]);
  }
}

// ---------- routes ----------
const router = Router();
router.param("id", checkId); // a malformed :id is rejected (400) before any route below runs

// Reading and creating: any logged-in staff member
router.get("/", validate(listSchema, "query"), async (_req, res) => {
  const { status, customerId, page, limit, sort } = res.locals.query;
  const filter = {};
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;

  const direction = sort.startsWith("-") ? -1 : 1;
  const sortField = sort.replace(/^-/, "");

  const [data, total] = await Promise.all([
    Order.find(filter)
      .sort({ [sortField]: direction, _id: direction }) // _id keeps paging stable on ties
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  res.status(200).json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.post("/", validate(createSchema), async (req, res) => {
  const { customerId, dueDate, notes } = req.body;
  await assertCustomerExists(customerId);

  // status defaults to "received"; handledBy comes from the token, so it can't be faked in the body
  const order = await Order.create({ customerId, dueDate, notes, handledBy: req.staff._id });
  res.status(201).location(`/orders/${order.id}`).json(order);
});

router.get("/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw orderNotFound();
  res.status(200).json(order);
});

// Changing or deleting: owner, or the staff member who handles the order.
// Order of checks: valid id (400) -> order exists (404) -> allowed (403) -> body valid (400)
router.patch("/:id", orderAccess, validate(updateSchema), async (req, res) => {
  if (req.body.customerId) await assertCustomerExists(req.body.customerId);
  const order = await Order.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after", runValidators: true });
  if (!order) throw orderNotFound();
  res.status(200).json(order);
});

router.delete("/:id", orderAccess, async (req, res) => {
  // An order's items have no meaning without it: delete them first, then the order.
  // (Not atomic: see design decisions, section 17.)
  await OrderItem.deleteMany({ orderId: req.params.id });
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) throw orderNotFound();
  res.status(200).json({ message: "Order deleted", id: order.id });
});

// Status: deliberately NOT behind orderAccess, so any logged-in staff can move an order along
router.patch("/:id/status", validate(statusSchema), async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { returnDocument: "after", runValidators: true }
  );
  if (!order) throw orderNotFound();
  res.status(200).json(order);
});

// Items live under their order: /orders/:id/items
router.use("/:id/items", itemsRouter);

export default router;
