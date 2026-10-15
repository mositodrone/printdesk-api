// An error we throw on purpose, carrying the HTTP status and the error code
// that the spec promises clients (see Error schema in docs/api-spec.yaml).
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
