import rateLimit from "express-rate-limit";
import { env } from "./config.js";
import { AppError } from "./errors.js";

// The limit is looked up on EVERY request, not once at start-up. Normally it is the value
// validated in config.js. Reading process.env first lets a test lower it with vi.stubEnv
// without having to reload the whole app (reloading would register the Mongoose models twice).
const limitFrom = (name) => () => {
  const fromProcess = Number(process.env[name]);
  return Number.isInteger(fromProcess) && fromProcess > 0 ? fromProcess : env[name];
};

// A 429 goes through the normal error handler, so it has the same shape as every other error.
// (express-rate-limit has already set the Retry-After header by the time this runs.)
const tooManyRequests = (_req, _res, next) =>
  next(new AppError(429, "RATE_LIMITED", "Too many attempts. Please wait and try again."));

const shared = {
  standardHeaders: "draft-7", // RateLimit and RateLimit-Policy headers
  legacyHeaders: false, // no old X-RateLimit-* headers
  handler: tooManyRequests,
};

// Brute-force protection: only FAILED logins (status 400 or above) use up the allowance,
// so people who type the right password are never locked out by their own successes.
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  limit: limitFrom("LOGIN_RATE_LIMIT_MAX"),
  skipSuccessfulRequests: true,
});

// Mass-account protection: every signup attempt counts.
export const signupLimiter = rateLimit({
  ...shared,
  windowMs: env.SIGNUP_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  limit: limitFrom("SIGNUP_RATE_LIMIT_MAX"),
});
