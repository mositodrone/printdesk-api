import "dotenv/config";
import mongoose from "mongoose";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("1h"),
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
