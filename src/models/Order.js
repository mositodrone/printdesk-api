import mongoose from "mongoose";
import { toJSONOptions } from "../utils/toJSON.js";

export const ORDER_STATUSES = ["received", "printing", "ready", "delivered", "cancelled"];

const orderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", default: null },
    status: { type: String, enum: ORDER_STATUSES, default: "received", index: true },
    dueDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      ...toJSONOptions,
      transform(doc, ret) {
        toJSONOptions.transform(doc, ret);
        // The spec exposes dueDate as a plain date (YYYY-MM-DD)
        ret.dueDate = ret.dueDate ? ret.dueDate.toISOString().slice(0, 10) : null;
        return ret;
      },
    },
  }
);

export const Order = mongoose.model("Order", orderSchema);
