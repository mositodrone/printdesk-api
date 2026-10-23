import mongoose from "mongoose";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// Responses show `id` instead of `_id` and hide `__v`
const toJSON = {
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
};

export const ORDER_STATUSES = ["received", "printing", "ready", "delivered", "cancelled"];

// Staff accounts. The password is stored only as a bcrypt hash, hidden from queries by default
// (select: false) and removed from every JSON response.
const staffSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["owner", "staff"], default: "staff" },
  },
  {
    timestamps: true,
    toJSON: {
      ...toJSON,
      transform(doc, ret) {
        toJSON.transform(doc, ret);
        delete ret.passwordHash; // never leaves the server
        return ret;
      },
    },
  }
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30, unique: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
  },
  { timestamps: true, toJSON }
);

const garmentTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    category: { type: String, trim: true, default: null },
    availableSizes: { type: [String], default: [] },
    availableColors: { type: [String], default: [] },
  },
  { timestamps: true, toJSON }
);

const orderSchema = new Schema(
  {
    customerId: { type: ObjectId, ref: "Customer", required: true, index: true },
    handledBy: { type: ObjectId, ref: "Staff", default: null },
    status: { type: String, enum: ORDER_STATUSES, default: "received", index: true },
    dueDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      ...toJSON,
      transform(doc, ret) {
        toJSON.transform(doc, ret);
        // The spec exposes dueDate as a plain date (YYYY-MM-DD)
        ret.dueDate = ret.dueDate ? ret.dueDate.toISOString().slice(0, 10) : null;
        return ret;
      },
    },
  }
);

const orderItemSchema = new Schema(
  {
    orderId: { type: ObjectId, ref: "Order", required: true, index: true },
    garmentTypeId: { type: ObjectId, ref: "GarmentType", required: true },
    size: { type: String, required: true, trim: true, maxlength: 30 },
    color: { type: String, required: true, trim: true, maxlength: 30 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
      validate: { validator: Number.isInteger, message: "quantity must be a whole number" },
    },
    designNote: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true, toJSON }
);

export const Staff = mongoose.model("Staff", staffSchema);
export const Customer = mongoose.model("Customer", customerSchema);
export const GarmentType = mongoose.model("GarmentType", garmentTypeSchema);
export const Order = mongoose.model("Order", orderSchema);
export const OrderItem = mongoose.model("OrderItem", orderItemSchema);
