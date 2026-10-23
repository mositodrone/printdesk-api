import jwt from "jsonwebtoken";
import { env } from "./config.js";
import { Staff, Order } from "./models.js";
import { AppError } from "./errors.js";

export const signToken = (staff) =>
  jwt.sign({ sub: staff.id, role: staff.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

const unauthorized = (message) => new AppError(401, "UNAUTHENTICATED", message);

// 401: who are you? Reads the token, loads the account, sets req.staff.
export async function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return next(unauthorized("Missing or malformed Authorization header"));

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return next(unauthorized("Invalid or expired token"));
  }

  // Load the account on every request, so deleted staff or changed roles take effect immediately
  const staff = await Staff.findById(payload.sub);
  if (!staff) return next(unauthorized("Account no longer exists"));

  req.staff = staff;
  next();
}

// 403: authorize("owner") -> only owners; authorize("owner", "staff") -> either role
export const authorize = (...roles) => (req, _res, next) =>
  roles.includes(req.staff.role)
    ? next()
    : next(new AppError(403, "FORBIDDEN", "You do not have permission to do this"));

// 404 or 403: may you CHANGE this order? Owners always; staff only if they handle it.
// Used by the order routes and the item routes, so the rule lives in one place.
export async function orderAccess(req, _res, next) {
  const order = await Order.findById(req.params.id);
  if (!order) return next(new AppError(404, "ORDER_NOT_FOUND", "Order not found"));

  const isOwner = req.staff.role === "owner";
  const isHandler = order.handledBy !== null && order.handledBy.equals(req.staff._id);
  if (!isOwner && !isHandler) {
    return next(new AppError(403, "FORBIDDEN", "You do not have permission to do this"));
  }

  req.order = order; // so a handler doesn't have to load it again
  next();
}
