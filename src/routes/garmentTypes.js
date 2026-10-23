import { Router } from "express";
import { GarmentType } from "../models.js";

const router = Router();

// Read-only: clients need these ids (and the sizes and colours on offer) to add order items
router.get("/", async (_req, res) => {
  const data = await GarmentType.find().sort({ name: 1 });
  res.status(200).json({ data });
});

export default router;
