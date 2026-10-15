import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  createOrderSchema,
  updateOrderSchema,
  updateStatusSchema,
  listOrdersQuerySchema,
} from "../validators/orders.validator.js";
import {
  listOrders,
  createOrder,
  getOrder,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
} from "../controllers/orders.controller.js";

const router = Router();

router.get("/", validate(listOrdersQuerySchema, "query"), asyncHandler(listOrders));
router.post("/", validate(createOrderSchema), asyncHandler(createOrder));
router.get("/:id", validateObjectId, asyncHandler(getOrder));
router.patch("/:id", validateObjectId, validate(updateOrderSchema), asyncHandler(updateOrder));
router.delete("/:id", validateObjectId, asyncHandler(deleteOrder));
router.patch(
  "/:id/status",
  validateObjectId,
  validate(updateStatusSchema),
  asyncHandler(updateOrderStatus)
);

export default router;
