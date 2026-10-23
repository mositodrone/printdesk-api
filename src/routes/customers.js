import { Router } from "express";
import { z } from "zod";
import { Customer, Order } from "../models.js";
import { validate, checkId } from "../validate.js";
import { authorize } from "../auth.js";
import { AppError } from "../errors.js";

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, "must be 7 to 20 characters: digits with an optional leading +, spaces, brackets or dashes"),
    email: z.email().max(254).optional(),
  })
  .strict();

const ordersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const customerNotFound = () => new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

const router = Router();
router.param("id", checkId);

// Any logged-in staff member can create and read customers (they are shared records)
router.post("/", validate(createSchema), async (req, res) => {
  const { name, phone, email } = req.body;
  // A duplicate phone number is rejected by the unique index and becomes a 409 in errors.js
  const customer = await Customer.create({ name, phone, email });
  res.status(201).json(customer);
});

router.get("/:id", async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw customerNotFound();
  res.status(200).json(customer);
});

router.get("/:id/orders", validate(ordersQuerySchema, "query"), async (req, res) => {
  if (!(await Customer.exists({ _id: req.params.id }))) throw customerNotFound();

  const { page, limit } = res.locals.query;
  const filter = { customerId: req.params.id };
  const [data, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  res.status(200).json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// Deleting is owner-only. The role check needs no database lookup, so it runs before the handler.
router.delete("/:id", authorize("owner"), async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw customerNotFound();

  // Orders are business records: refuse to delete a customer who still has any
  if (await Order.exists({ customerId: customer._id })) {
    throw new AppError(409, "CUSTOMER_HAS_ORDERS", "Customer still has orders and cannot be deleted");
  }

  await customer.deleteOne();
  res.status(200).json({ message: "Customer deleted", id: customer.id });
});

export default router;
