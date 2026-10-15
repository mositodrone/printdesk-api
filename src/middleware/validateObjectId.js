import { AppError } from "../utils/AppError.js";

// A malformed :id is a client mistake (400), not "not found" and not a crash.
export function validateObjectId(req, _res, next) {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) {
    return next(
      new AppError(400, "VALIDATION_ERROR", "Invalid id", [
        { field: "id", issue: "must be a 24-character hex id" },
      ])
    );
  }
  next();
}
