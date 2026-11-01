import "dotenv/config";
import mongoose from "mongoose";
import { z } from "zod";

// CORS_ORIGINS is a comma-separated list, e.g. "https://app.example.com,http://localhost:5173".
// Empty (the default) means: no browser on another website may read this API's responses.
// Wildcards, paths and trailing slashes are refused on purpose, so a typo can't open the API up.
const originList = z
  .string()
  .default("")
  .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean))
  .refine(
    (list) => list.every((o) => /^https?:\/\/[^/\s]+$/.test(o)),
    "each origin must look like https://example.com (no path, no trailing slash, no *)"
  );

const positiveInt = (fallback) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("1h"),

  // How many proxies sit in front of the app. 0 locally; on Render set TRUST_PROXY=1,
  // otherwise every visitor looks like the same IP address and shares one rate limit.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  CORS_ORIGINS: originList,

  // Login: only FAILED attempts count. Signup: every attempt counts.
  LOGIN_RATE_LIMIT_MAX: positiveInt(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: positiveInt(15),
  SIGNUP_RATE_LIMIT_MAX: positiveInt(5),
  SIGNUP_RATE_LIMIT_WINDOW_MINUTES: positiveInt(60),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Print which variables are wrong, never their values (they may be secrets)
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  console.error("Invalid environment configuration:\n- " + problems.join("\n- "));
  process.exit(1);
}
export const env = parsed.data;

export async function connectDB() {
  await mongoose.connect(env.MONGODB_URI);
  console.log("MongoDB connected");
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
