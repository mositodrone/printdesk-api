import mongoose from "mongoose";
import { toJSONOptions } from "../utils/toJSON.js";

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
  },
  { timestamps: true, toJSON: toJSONOptions }
);

export const Customer = mongoose.model("Customer", customerSchema);
