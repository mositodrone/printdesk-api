import { AppError } from "../utils/AppError.js";

export function notFound(req, _res, next) {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
}
