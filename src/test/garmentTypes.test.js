import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";
import { bearer, makeGarment, makeStaff } from "./helpers.js";

describe("GET /garment-types", () => {
  it("needs a login", async () => {
    const res = await request(app).get("/garment-types");

    expect(res.status).toBe(401);
  });

  it("returns an empty list when there are none", async () => {
    const { token } = await makeStaff();

    const res = await request(app).get("/garment-types").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it("lists garments sorted by name, with their sizes and colours", async () => {
    const { token } = await makeStaff();
    await makeGarment({ name: "Hoodie", availableSizes: ["S", "L"], availableColors: ["navy"] });
    await makeGarment({ name: "Cap", availableSizes: ["One size"], availableColors: ["black"] });

    const res = await request(app).get("/garment-types").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.data.map((g) => g.name)).toEqual(["Cap", "Hoodie"]);
    expect(res.body.data[1]).toMatchObject({ availableSizes: ["S", "L"], availableColors: ["navy"] });
  });

  it("is read-only: POST, PATCH and DELETE are not routes (404)", async () => {
    const { token } = await makeStaff("owner");

    for (const method of ["post", "patch", "delete"]) {
      const res = await request(app)[method]("/garment-types").set(bearer(token)).send({});
      expect(res.status, method).toBe(404);
    }
  });
});
