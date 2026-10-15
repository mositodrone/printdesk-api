import { Order } from "../models/Order.js";
import { Customer } from "../models/Customer.js";
import { AppError } from "../utils/AppError.js";

const orderNotFound = () => new AppError(404, "ORDER_NOT_FOUND", "Order not found");

async function assertCustomerExists(customerId) {
  const exists = await Customer.exists({ _id: customerId });
  if (!exists) {
    throw new AppError(400, "VALIDATION_ERROR", "Request body is invalid", [
      { field: "customerId", issue: "customerId does not match an existing customer" },
    ]);
  }
}

// GET /orders
export async function listOrders(_req, res) {
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

  res.status(200).json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// POST /orders
export async function createOrder(req, res) {
  const { customerId, dueDate, notes } = req.body;
  await assertCustomerExists(customerId);

  const order = await Order.create({ customerId, dueDate, notes }); // status defaults to "received"
  res.status(201).location(`/orders/${order.id}`).json(order);
}

// GET /orders/:id
export async function getOrder(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) throw orderNotFound();
  res.status(200).json(order);
}

// PATCH /orders/:id
export async function updateOrder(req, res) {
  if (req.body.customerId) await assertCustomerExists(req.body.customerId);

  const order = await Order.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!order) throw orderNotFound();
  res.status(200).json(order);
}

// PATCH /orders/:id/status
export async function updateOrderStatus(req, res) {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { returnDocument: "after", runValidators: true }
  );
  if (!order) throw orderNotFound();
  res.status(200).json(order);
}

// DELETE /orders/:id
export async function deleteOrder(req, res) {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) throw orderNotFound();
  res.status(200).json({ message: "Order deleted", id: order.id });
}
