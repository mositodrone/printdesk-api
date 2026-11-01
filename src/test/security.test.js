import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { Customer } from "../models.js";
import { PASSWORD, bearer, makeStaff } from "./helpers.js";

// Undo any vi.stubEnv() from a test, so one test's tweaks never leak into the next.
afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------------------
// Input sanitisation
// NoSQL injection works by sending an OBJECT where the code expects a string, e.g.
// { "email": { "$ne": null } } ("email is anything that isn't null") in a login.
// Your strict Zod schemas should refuse every one of these before the database sees them.
// ---------------------------------------------------------------------------------------
describe("input sanitisation: operator objects are rejected", () => {
  it("login: an operator object instead of an email -> 400", async () => {
    await makeStaff();

    const res = await request(app)
      .post("/auth/login")
      .send({ email: { $ne: null }, password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("login: an operator object instead of a password -> 400", async () => {
    const { staff } = await makeStaff();

    const res = await request(app)
      .post("/auth/login")
      .send({ email: staff.email, password: { $ne: "" } });

    expect(res.status).toBe(400);
  });

  it("create customer: an operator object as the name -> 400, nothing saved", async () => {
    const { token } = await makeStaff();

    const res = await request(app)
      .post("/customers")
      .set(bearer(token))
      .send({ name: { $gt: "" }, phone: "+2348012345678" });

    expect(res.status).toBe(400);
    expect(await Customer.countDocuments()).toBe(0);
  });

  it("create order: an operator object as customerId -> 400", async () => {
    const { token } = await makeStaff();

    const res = await request(app)
      .post("/orders")
      .set(bearer(token))
      .send({ customerId: { $ne: null } });

    expect(res.status).toBe(400);
  });

  // The query string version: ?status[$ne]=x. Whether Express turns this into an object or
  // into an odd key name, the strict query schema must answer 400 either way.
  it.each([["status[$ne]=received"], ["customerId[$gt]="], ["sort[$ne]=x"], ["page[$gt]=0"]])(
    "list orders: query %s -> 400",
    async (query) => {
      const { token } = await makeStaff();

      const res = await request(app).get(`/orders?${query}`).set(bearer(token));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  );
});

// ---------------------------------------------------------------------------------------
// CORS
// vitest.config.js allows exactly one origin for the tests. Your real default is NO origin.
// ---------------------------------------------------------------------------------------
describe("CORS", () => {
  const ALLOWED = "https://app.example.com"; // must match CORS_ORIGINS in vitest.config.js
  const STRANGER = "https://evil.example.com";

  it("a request with no Origin (curl, REST Client, Postman) works and gets no CORS headers", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("an allowed origin gets its own origin echoed back, never *", async () => {
    const res = await request(app).get("/health").set("Origin", ALLOWED);

    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["vary"]).toMatch(/Origin/i);
  });

  it("any other origin gets no CORS headers, so the browser will not show it the response", async () => {
    const res = await request(app).get("/health").set("Origin", STRANGER);

    // The server still answers (CORS is enforced by the BROWSER, not by the server)...
    expect(res.status).toBe(200);
    // ...but without the header that lets that website read it.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("preflight from the allowed origin: allowed methods, headers and a cache time", async () => {
    const res = await request(app)
      .options("/orders")
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-methods"]).toMatch(/PATCH/);
    expect(res.headers["access-control-allow-headers"]).toMatch(/authorization/i);
    expect(res.headers["access-control-max-age"]).toBe("600");
  });

  it("preflight from any other origin gets no permission", async () => {
    const res = await request(app)
      .options("/orders")
      .set("Origin", STRANGER)
      .set("Access-Control-Request-Method", "DELETE");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("cookies are not allowed cross-origin (tokens travel in the Authorization header)", async () => {
    const res = await request(app).get("/health").set("Origin", ALLOWED);

    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------
// Rate limiting on the auth routes
// Each test pretends to be a different visitor by sending its own X-Forwarded-For address
// (this works because the tests run with TRUST_PROXY=1). That keeps the tests independent
// without having to reset the limiter's memory between them.
// The limit is lowered per test with vi.stubEnv; everywhere else it is 1000.
// ---------------------------------------------------------------------------------------
describe("rate limiting", () => {
  const from = (lastOctet) => ({ "X-Forwarded-For": `203.0.113.${lastOctet}` });

  const wrongLogin = (visitor, email = "nobody@example.com") =>
    request(app).post("/auth/login").set(from(visitor)).send({ email, password: "wrong-password-1" });

  const signup = (visitor, n) =>
    request(app)
      .post("/auth/signup")
      .set(from(visitor))
      .send({ name: `Person ${n}`, email: `person.${n}@example.com`, password: "a-long-password" });

  describe("login", () => {
    it("allows the configured number of failed attempts, then answers 429 RATE_LIMITED", async () => {
      vi.stubEnv("LOGIN_RATE_LIMIT_MAX", "3");

      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await wrongLogin(10);
        expect(res.status, `attempt ${attempt}`).toBe(401);
      }

      const blocked = await wrongLogin(10);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
      expect(blocked.headers["retry-after"]).toBeDefined();
    });

    it("once locked out, even the CORRECT password is refused", async () => {
      vi.stubEnv("LOGIN_RATE_LIMIT_MAX", "3");
      const { staff } = await makeStaff();

      for (let attempt = 1; attempt <= 3; attempt++) await wrongLogin(11, staff.email);

      const res = await request(app).post("/auth/login").set(from(11)).send({ email: staff.email, password: PASSWORD });
      expect(res.status).toBe(429);
    });

    it("successful logins do not use up the allowance", async () => {
      vi.stubEnv("LOGIN_RATE_LIMIT_MAX", "2");
      const { staff } = await makeStaff();

      for (let i = 0; i < 5; i++) {
        const ok = await request(app).post("/auth/login").set(from(12)).send({ email: staff.email, password: PASSWORD });
        expect(ok.status, `successful login ${i + 1}`).toBe(200);
      }

      // ...but failures still count, from a clean slate
      expect((await wrongLogin(12, staff.email)).status).toBe(401);
      expect((await wrongLogin(12, staff.email)).status).toBe(401);
      expect((await wrongLogin(12, staff.email)).status).toBe(429);
    });

    it("limits are per visitor: one locked-out address does not lock out another", async () => {
      vi.stubEnv("LOGIN_RATE_LIMIT_MAX", "2");

      await wrongLogin(20);
      await wrongLogin(20);
      expect((await wrongLogin(20)).status).toBe(429);

      expect((await wrongLogin(21)).status).toBe(401);
    });

    it("a locked-out visitor can still use the rest of the API", async () => {
      vi.stubEnv("LOGIN_RATE_LIMIT_MAX", "1");
      const { token } = await makeStaff();

      await wrongLogin(30);
      expect((await wrongLogin(30)).status).toBe(429);

      expect((await request(app).get("/health").set(from(30))).status).toBe(200);
      expect((await request(app).get("/orders").set(from(30)).set(bearer(token))).status).toBe(200);
    });
  });

  describe("signup", () => {
    it("allows the configured number of signups, then answers 429 RATE_LIMITED", async () => {
      vi.stubEnv("SIGNUP_RATE_LIMIT_MAX", "2");

      expect((await signup(40, 1)).status).toBe(201);
      expect((await signup(40, 2)).status).toBe(201);

      const blocked = await signup(40, 3);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
    });

    it("signup and login have separate allowances", async () => {
      vi.stubEnv("SIGNUP_RATE_LIMIT_MAX", "1");

      expect((await signup(41, 1)).status).toBe(201);
      expect((await signup(41, 2)).status).toBe(429);

      // Same visitor, but login still works normally
      expect((await wrongLogin(41)).status).toBe(401);
    });
  });
});
