import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Staff } from "../models.js";
import { validate } from "../validate.js";
import { signToken } from "../auth.js";
import { AppError } from "../errors.js";

const email = z.email().max(254).transform((s) => s.toLowerCase());

const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email,
    password: z.string().min(8, "must be at least 8 characters").max(72, "must be 72 characters or fewer"),
  })
  .strict(); // a "role" field is rejected, so nobody can choose their own role

const loginSchema = z.object({ email, password: z.string().min(1).max(72) }).strict();

const router = Router();

router.post("/signup", validate(signupSchema), async (req, res) => {
  const { name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12); // only the hash is ever stored
  const staff = await Staff.create({ name, email, passwordHash }); // role defaults to "staff"
  res.status(201).json(staff);
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const staff = await Staff.findOne({ email }).select("+passwordHash");
  const passwordOk = staff && (await bcrypt.compare(password, staff.passwordHash));
  if (!passwordOk) {
    // Same message whether the email or the password was wrong
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  res.status(200).json({ token: signToken(staff), staff });
});

export default router;
