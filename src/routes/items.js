import { Router } from "express";
import { z } from "zod";
import { Order, OrderItem, GarmentType } from "../models.js";
import { validate, checkId, objectId } from "../validate.js";
import { orderAccess } from "../auth.js";
import { AppError } from "../errors.js";

const createSchema = z
  .object({
    garmentTypeId: objectId,
    size: z.string().trim().min(1).max(30),
    color: z.string().trim().min(1).max(30),
    quantity: z.number().int("must be a whole number").min(1, "must be at least 1").max(1000, "must be 1000 or fewer"),
    designNote: z.string().trim().max(300, "must be 300 characters or fewer").optional(),
  })
  .strict();

const invalid = (field, issue) => new AppError(400, "VALIDATION_ERROR", "Request body is invalid", [{ field, issue }]);

// mergeParams lets this router read :id from where it is mounted (/orders/:id/items).
// That :id is already checked by orders.js; only :itemId is checked here.
const router = Router({ mergeParams: true });
router.param("itemId", checkId);

// Any logged-in staff can read an order's items
router.get("/", async (req, res) => {
  if (!(await Order.exists({ _id: req.params.id }))) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  const data = await OrderItem.find({ orderId: req.params.id }).sort({ createdAt: 1, _id: 1 });
  res.status(200).json({ data });
});

// Changing items follows the same rule as changing the order: owner or handler (orderAccess loads req.order)
router.post("/", orderAccess, validate(createSchema), async (req, res) => {
  const { garmentTypeId, size, color, quantity, designNote } = req.body;

  // The garment must exist, and must really offer this size and colour
  const garment = await GarmentType.findById(garmentTypeId);
  if (!garment) throw invalid("garmentTypeId", "garmentTypeId does not match an existing garment type");
  if (!garment.availableSizes.includes(size)) throw invalid("size", `must be one of: ${garment.availableSizes.join(", ")}`);
  if (!garment.availableColors.includes(color)) throw invalid("color", `must be one of: ${garment.availableColors.join(", ")}`);

  // The same garment, size and colour twice on one order: update the quantity instead
  if (await OrderItem.exists({ orderId: req.order._id, garmentTypeId, size, color })) {
    throw new AppError(409, "DUPLICATE_ITEM", "This order already has an item with the same garment, size and colour");
  }

  const item = await OrderItem.create({ orderId: req.order._id, garmentTypeId, size, color, quantity, designNote });
  res.status(201).json(item);
});

router.delete("/:itemId", orderAccess, async (req, res) => {
  // Matching on orderId too means an item that belongs to a different order is "not found"
  const item = await OrderItem.findOneAndDelete({ _id: req.params.itemId, orderId: req.params.id });
  if (!item) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found");
  res.status(200).json({ message: "Item deleted", id: item.id });
});

export default router;
