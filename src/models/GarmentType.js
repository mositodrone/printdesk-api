import mongoose from "mongoose";
import { toJSONOptions } from "../utils/toJSON.js";

const garmentTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    category: { type: String, trim: true, default: null },
    availableSizes: { type: [String], default: [] },
    availableColors: { type: [String], default: [] },
  },
  { timestamps: true, toJSON: toJSONOptions }
);

export const GarmentType = mongoose.model("GarmentType", garmentTypeSchema);
