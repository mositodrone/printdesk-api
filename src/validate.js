import { z } from "zod";
import { AppError } from "./errors.js";

const HEX_ID = /^[a-f0-9]{24}$/i;

// Reusable rule for ids sent in a request body or query
export const objectId = z.string().regex(HEX_ID, "must be a 24-character hex id");

// validate(schema)           -> checks req.body and replaces it with the cleaned data
// validate(schema, "query")  -> checks req.query, puts the cleaned data in res.locals.query
//                               (Express 5 makes req.query read-only)
export const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(source === "query" ? req.query : (req.body ?? {}));

  if (!result.success) {
    const message = source === "query" ? "Query parameters are invalid" : "Request body is invalid";
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      issue: issue.message,
    }));
    return next(new AppError(400, "VALIDATION_ERROR", message, details));
  }

  if (source === "query") res.locals.query = result.data;
  else req.body = result.data;
  next();
};

// Use as router.param("id", checkId): Express then checks that URL parameter on EVERY route
// of that router, before anything else runs. A malformed id is a client mistake (400).
export function checkId(_req, _res, next, value, name) {
  if (!HEX_ID.test(value)) {
    return next(new AppError(400, "VALIDATION_ERROR", "Invalid id", [{ field: name, issue: "must be a 24-character hex id" }]));
  }
  next();
}
