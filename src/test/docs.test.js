import { readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import app from "../app.js";

const spec = parse(readFileSync(new URL("../../docs/api-spec.yaml", import.meta.url), "utf8"));

describe("API docs page (/docs)", () => {
  it("is public: no token needed to open it", async () => {
    const res = await request(app).get("/docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/swagger-ui/i);
  });

  it("the rest of the API is still protected", async () => {
    const res = await request(app).get("/orders");

    expect(res.status).toBe(401);
  });

  it("serves the spec with the Authorize (bearerAuth) button and calls its own host", async () => {
    const res = await request(app).get("/docs/swagger-ui-init.js");

    expect(res.status).toBe(200);
    expect(res.text).toContain("bearerAuth");
    expect(res.text).toContain("This server");
  });

  it("the spec file itself documents the rate-limit response on both auth routes", () => {
    expect(spec.paths["/auth/login"].post.responses).toHaveProperty("429");
    expect(spec.paths["/auth/signup"].post.responses).toHaveProperty("429");
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
  });

  it("the root endpoint index points to the docs", async () => {
    const res = await request(app).get("/");

    expect(res.body.endpoints.docs).toBe("/docs");
  });
});
