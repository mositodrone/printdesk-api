import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    // globalSetup runs ONCE for the whole run: it starts the in-memory MongoDB.
    // setupFiles run before EVERY test file: they connect, and clean the data between tests.
    globalSetup: ["./src/test/globalSetup.js"],
    setupFiles: ["./src/test/setup.js"],

    // All test files share one database, so run them one after another.
    // (Tests inside a single file already run in order.)
    fileParallelism: false,
	
    // The very first run downloads a mongod binary, which can be slow.
    hookTimeout: 120_000,

    // Fake environment for the tests. config.js validates these on import and calls
    // process.exit(1) if they are missing, so they MUST be set here.
    // dotenv never overrides variables that already exist, so your real .env
    // (with the Atlas URI) is ignored while testing. That is exactly what we want.
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
      JWT_EXPIRES_IN: "1h",
      MONGODB_URI: "mongodb://127.0.0.1:1/never-used-in-tests",

      // One allowed origin, so the tests can prove the allowlist works.
      // (Your real default is an empty list: no browser origin allowed.)
      CORS_ORIGINS: "https://app.example.com",

      // Trust one proxy, so a test can pretend to be different visitors with X-Forwarded-For.
      TRUST_PROXY: "1",

      // Limits so high that the ordinary tests never hit them.
      // test/security.test.js lowers them on purpose, one test at a time.
      LOGIN_RATE_LIMIT_MAX: "1000",
      SIGNUP_RATE_LIMIT_MAX: "1000",
    },

      // Only used by `npm run coverage`
     coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      // Not covered on purpose: see docs/testing.md
      exclude: ["src/test/**", "src/server.js", "src/seed.js"],
      reporter: ["text", "html"],
    },
  },
});
