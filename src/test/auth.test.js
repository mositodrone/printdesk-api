import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";
import { Staff } from "../models.js";
import { PASSWORD, makeStaff } from "./helpers.js";

describe("POST /auth/signup", () => {
  const valid = { name: "New Staff", email: "new@example.com", password: "a-long-password" };

  it("creates a staff account (201) and never returns the password", async () => {
    const res = await request(app).post("/auth/signup").send(valid);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "New Staff", email: "new@example.com", role: "staff" });
    expect(res.body.id).toMatch(/^[a-f0-9]{24}$/);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password).toBeUndefined();
  });

  it("stores only a bcrypt hash, not the password", async () => {
    await request(app).post("/auth/signup").send(valid);

    // select("+passwordHash") because the model hides that field by default
    const saved = await Staff.findOne({ email: "new@example.com" }).select("+passwordHash");
    expect(saved.passwordHash).not.toBe(valid.password);
    expect(saved.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("lowercases the email", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ ...valid, email: "Mixed.Case@Example.COM" });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("mixed.case@example.com");
  });

  it("rejects a role in the body, so nobody can pick their own role", async () => {
    const res = await request(app).post("/auth/signup").send({ ...valid, role: "owner" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await Staff.countDocuments()).toBe(0);
  });

  // it.each runs the same test once per row: a cheap way to cover many bad inputs
  it.each([
    ["password too short", { password: "short" }, "password"],
    ["password too long (73 chars)", { password: "x".repeat(73) }, "password"],
    ["invalid email", { email: "not-an-email" }, "email"],
    ["blank name", { name: "   " }, "name"],
  ])("%s -> 400 pointing at the bad field", async (_label, change, field) => {
    const res = await request(app).post("/auth/signup").send({ ...valid, ...change });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  it("missing fields -> 400", async () => {
    const res = await request(app).post("/auth/signup").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it("email already registered -> 409 DUPLICATE_RECORD", async () => {
    await request(app).post("/auth/signup").send(valid);
    const res = await request(app).post("/auth/signup").send(valid);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_RECORD");
    expect(res.body.error.details).toEqual([{ field: "email", issue: "must be unique" }]);
  });

  it("the duplicate check ignores letter case", async () => {
    await request(app).post("/auth/signup").send(valid);
    const res = await request(app).post("/auth/signup").send({ ...valid, email: "NEW@EXAMPLE.COM" });

    expect(res.status).toBe(409);
  });
});

describe("POST /auth/login", () => {
  it("returns a token and the staff member (200)", async () => {
    const { staff } = await makeStaff("owner");

    const res = await request(app).post("/auth/login").send({ email: staff.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.staff).toMatchObject({ id: staff.id, email: staff.email, role: "owner" });
    expect(res.body.staff.passwordHash).toBeUndefined();
  });

  it("the token it returns actually works on a protected route", async () => {
    const { staff } = await makeStaff();
    const login = await request(app).post("/auth/login").send({ email: staff.email, password: PASSWORD });

    const res = await request(app).get("/orders").set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
  });

  it("works whatever case the email is typed in", async () => {
    const { staff } = await makeStaff();

    const res = await request(app)
      .post("/auth/login")
      .send({ email: staff.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(200);
  });

  it("wrong password and unknown email give the SAME 401, so emails can't be discovered", async () => {
    const { staff } = await makeStaff();

    const wrongPassword = await request(app).post("/auth/login").send({ email: staff.email, password: "not-the-password" });
    const unknownEmail = await request(app).post("/auth/login").send({ email: "nobody@example.com", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it.each([
    ["no password", { email: "a@example.com" }],
    ["no email", { password: "whatever-123" }],
    ["unknown field", { email: "a@example.com", password: "whatever-123", remember: true }],
  ])("%s -> 400", async (_label, body) => {
    const res = await request(app).post("/auth/login").send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
