import express from "express";
import cors from "cors";
import { authenticate } from "./auth.js";
import { env } from "./config.js";
import { notFound, errorHandler } from "./errors.js";
import { loginLimiter, signupLimiter } from "./rateLimit.js";
import docsRoutes from "./docs.js";
import authRoutes from "./routes/auth.js";
import orderRoutes from "./routes/orders.js";
import garmentTypeRoutes from "./routes/garmentTypes.js";
import customerRoutes from "./routes/customers.js";

const app = express();

app.disable("x-powered-by");

// Behind Render's proxy, req.ip must be the visitor's address (it is what rate limiting counts by).
app.set("trust proxy", env.TRUST_PROXY);

// CORS is a decision, not a default. Only the origins listed in CORS_ORIGINS may read responses
// in a browser; with the list empty (today, no frontend yet) no website can. This does NOT
// block curl, Postman or REST Client: they send no Origin and CORS is a browser-only rule.
// Tokens travel in the Authorization header, never in cookies, so credentials stay off.
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600, // browsers may cache the preflight answer for 10 minutes
  })
);

app.use(express.json({ limit: "10kb" }));

// Public: no login needed
app.get("/", (_req, res) =>
  res.status(200).json({ name: "PrintDesk API", status: "ok", endpoints: { health: "/health", docs: "/docs", orders: "/orders" } })
);
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" })); // also wakes a sleeping free-tier host

// Interactive API docs (Swagger UI). Public: it only shows the spec. Calls made from it
// still need a token, which you paste into its Authorize button.
app.use("/docs", docsRoutes);

// Rate limits sit in front of the two public auth routes, before any password hashing happens.
app.post("/auth/login", loginLimiter);
app.post("/auth/signup", signupLimiter);
app.use("/auth", authRoutes);

// Everything below needs a valid token. authenticate sets req.staff for the routes that follow.
app.use("/orders", authenticate, orderRoutes);
app.use("/garment-types", authenticate, garmentTypeRoutes);
app.use("/customers", authenticate, customerRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
