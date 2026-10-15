import { AppError } from "../utils/AppError.js";

// validate(schema)           -> checks req.body, replaces it with the parsed data
// validate(schema, "query")  -> checks req.query, puts parsed data in res.locals.query
//                               (Express 5 makes req.query read-only)
export const validate = (schema, source = "body") => (req, res, next) => {
  const input = source === "query" ? req.query : (req.body ?? {});
  const result = schema.safeParse(input);

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
