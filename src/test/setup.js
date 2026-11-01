import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import "../models.js"; // registers the five models, so we can loop over them below

beforeAll(async () => {
  await mongoose.connect(inject("mongoUri"));

  // Build the unique indexes (staff email, customer phone, garment name) NOW.
  // Mongoose normally builds them in the background, so without this the first
  // "duplicate" test can race the index and fail randomly (a flaky test).
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

// Every test starts with empty collections, so tests can't affect each other.
// This hook is registered before the hooks in your test files, so it runs first.
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
