import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print which variables are wrong, never their values (they may be secrets)
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  console.error("Invalid environment configuration:\n- " + problems.join("\n- "));
  process.exit(1);
}

export const env = parsed.data;
