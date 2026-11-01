import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";
import { bearer, makeStaff } from "./helpers.js";

// The simplest tests to start with: no login, no data. The pattern for every test is
//   1. ARRANGE  - get things ready (here: nothing)
//   2. ACT      - make the request
//   3. ASSERT   - check the response with expect(...)

describe("public routes", () => {
  it("GET / describes the API", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("PrintDesk API");
    expect(res.body.endpoints).toEqual({ health: "/health", orders: "/orders", docs: "/docs" });
  });

  it("GET /health says ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("does not advertise Express in a header", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("errors that can happen on any route", () => {
  it("unknown route -> 404 NOT_FOUND in the standard error shape", async () => {
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toContain("GET /nope");
  });

  it("body that is not valid JSON -> 400 INVALID_JSON", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{ this is not json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("body over 10 KB -> 413 PAYLOAD_TOO_LARGE", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "x".repeat(11_000), email: "big@example.com", password: "long-enough-1" });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("checks the body BEFORE login: bad JSON with no token is a 400, not a 401", async () => {
    // This pins down the order of checks from your API notes.
    const res = await request(app)
      .post("/orders")
      .set("Content-Type", "application/json")
      .send("{ broken");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("an error never leaks a stack trace", async () => {
    const { token } = await makeStaff();
    const res = await request(app).get("/orders/not-a-real-id").set(bearer(token));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|\.js:\d+/);
  });
});
