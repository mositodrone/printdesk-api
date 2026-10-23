// An error we throw on purpose, carrying the HTTP status and the error code clients can rely on.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(req, _res, next) {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
}

// Every error leaves the API in the same shape. Stack traces and internal messages are
// logged on the server, never sent to the client.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) },
    });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
  }

  if (err.code === 11000) {
    // MongoDB duplicate key: a unique value (staff email, customer phone) is already taken
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "value";
    return res.status(409).json({
      error: {
        code: "DUPLICATE_RECORD",
        message: `A record with this ${field} already exists`,
        details: [{ field, issue: "must be unique" }],
      },
    });
  }

  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
