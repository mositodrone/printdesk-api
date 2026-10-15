// Shared Mongoose toJSON options: expose `id` instead of `_id`, drop `__v`.
export const toJSONOptions = {
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
};
