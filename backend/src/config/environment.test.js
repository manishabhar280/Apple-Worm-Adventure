import assert from "node:assert/strict";
import test from "node:test";
import { getServerConfig } from "./environment.js";

const validProductionEnvironment = {
  NODE_ENV: "production",
  PORT: "10000",
  FRONTEND_ORIGIN: "https://apple-worm-deploy.com",
  MONGODB_URI: "mongodb+srv://user:secret@cluster.example.com/apple-worm?retryWrites=true&w=majority",
  JWT_SECRET: "a-production-only-secret-that-is-long-enough-123456",
  REWARDED_AD_PROVIDER: "unconfigured",
};

test("accepts production configuration without local development defaults", () => {
  assert.deepEqual(getServerConfig(validProductionEnvironment), {
    port: 10000,
    frontendOrigin: validProductionEnvironment.FRONTEND_ORIGIN,
    jwtSecret: validProductionEnvironment.JWT_SECRET,
  });
});

test("rejects incomplete production URLs, database configuration, secrets, and ad simulation", () => {
  for (const invalidEnvironment of [
    { ...validProductionEnvironment, FRONTEND_ORIGIN: "" },
    { ...validProductionEnvironment, FRONTEND_ORIGIN: "http://apple-worm.example.com" },
    { ...validProductionEnvironment, FRONTEND_ORIGIN: "https://your-frontend-host.example" },
    { ...validProductionEnvironment, MONGODB_URI: "mongodb+srv://<username>:<password>@<cluster-host>/<database>" },
    { ...validProductionEnvironment, JWT_SECRET: "replace_with_a_random_secret_at_least_32_chars" },
    { ...validProductionEnvironment, REWARDED_AD_PROVIDER: "development_simulation" },
  ]) {
    assert.throws(() => getServerConfig(invalidEnvironment));
  }
});

test("validates ports and falls back to localhost only outside production", () => {
  assert.equal(getServerConfig({
    JWT_SECRET: "local-development-secret-with-at-least-32-characters",
  }).frontendOrigin, "http://localhost:5173");
  assert.throws(() => getServerConfig({
    PORT: "70000",
    JWT_SECRET: "local-development-secret-with-at-least-32-characters",
  }), /PORT/);
});
