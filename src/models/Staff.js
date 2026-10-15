import mongoose from "mongoose";
import { toJSONOptions } from "../utils/toJSON.js";

// Schema only in Week 1 (no endpoints yet). Authentication arrives in Week 2.
const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["owner", "staff"], default: "staff" },
  },
  {
    timestamps: true,
    toJSON: {
      ...toJSONOptions,
      transform(doc, ret) {
        toJSONOptions.transform(doc, ret);
        delete ret.passwordHash; // never leaves the server
        return ret;
      },
    },
  }
);

export const Staff = mongoose.model("Staff", staffSchema);
