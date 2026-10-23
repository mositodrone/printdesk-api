import express from "express";
import { authenticate } from "./auth.js";
import { notFound, errorHandler } from "./errors.js";
import authRoutes from "./routes/auth.js";
import orderRoutes from "./routes/orders.js";
import garmentTypeRoutes from "./routes/garmentTypes.js";
import customerRoutes from "./routes/customers.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

// Public: no login needed
app.get("/", (_req, res) =>
  res.status(200).json({ name: "PrintDesk API", status: "ok", endpoints: { health: "/health", orders: "/orders" } })
);
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" })); // also wakes a sleeping free-tier host
app.use("/auth", authRoutes);

// Everything below needs a valid token. authenticate sets req.staff for the routes that follow.
app.use("/orders", authenticate, orderRoutes);
app.use("/garment-types", authenticate, garmentTypeRoutes);
app.use("/customers", authenticate, customerRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
