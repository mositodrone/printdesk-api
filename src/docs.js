import { readFileSync } from "node:fs";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { parse } from "yaml";

// The API spec in docs/ is the single source of truth: this page just renders it.
const spec = parse(readFileSync(new URL("../docs/api-spec.yaml", import.meta.url), "utf8"));

// The spec lists localhost and Render for editors like Postman. Here, "Try it out" should
// call whichever host is serving this page, so it works locally and on Render with no CORS.
spec.servers = [{ url: "/", description: "This server" }];

const router = Router();

router.use(swaggerUi.serve);
router.get(
  "/",
  swaggerUi.setup(spec, {
    customSiteTitle: "PrintDesk API docs",
    swaggerOptions: {
      persistAuthorization: true, // keep the pasted token across page refreshes (this browser only)
      displayRequestDuration: true,
    },
  })
);

export default router;
