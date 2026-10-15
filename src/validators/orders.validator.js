import { z } from "zod";
import { ORDER_STATUSES } from "../models/Order.js";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "must be a 24-character hex id");

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format")
  .refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "must be a real calendar date");

const notes = z.string().max(500, "must be 500 characters or fewer");

// On create, the due date cannot be in the past (compared as UTC dates)
const futureDate = dateOnly.refine(
  (s) => s >= new Date().toISOString().slice(0, 10),
  "must be today or later"
);

export const createOrderSchema = z
  .object({
    customerId: objectId,
    dueDate: futureDate.optional(),
    notes: notes.optional(),
  })
  .strict();

export const updateOrderSchema = z
  .object({
    customerId: objectId.optional(),
    dueDate: dateOnly.nullable().optional(),
    notes: notes.nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "at least one field is required");

export const updateStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { error: `must be one of: ${ORDER_STATUSES.join(", ")}` }),
  })
  .strict();

export const listOrdersQuerySchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { error: `must be one of: ${ORDER_STATUSES.join(", ")}` }).optional(),
    customerId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(["createdAt", "-createdAt", "dueDate", "-dueDate"]).default("-createdAt"),
  })
  .strict();
