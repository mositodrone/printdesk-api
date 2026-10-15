import express from "express";
import ordersRouter from "./routes/orders.routes.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

// Lightweight check for the host and for waking a sleeping free-tier server
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/", (_req, res) =>
  res.status(200).json({
    name: "PrintDesk API",
    status: "ok",
    endpoints: { health: "/health", orders: "/orders" },
  })
);

app.use("/orders", ordersRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
