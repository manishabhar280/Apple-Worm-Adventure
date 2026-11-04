import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import { errorHandler } from "./errorHandler.js";
import { verifyRequestOrigin } from "./verifyRequestOrigin.js";

test("requires the configured origin for unsafe cookie-authenticated requests", async (t) => {
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = "https://game.example.test";
  const app = express();
  app.use(verifyRequestOrigin);
  app.post("/change", (_request, response) => response.json({ saved: true }));
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  t.after(async () => {
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  const url = `http://127.0.0.1:${server.address().port}/change`;

  const allowed = await fetch(url, {
    method: "POST",
    headers: {
      Origin: "https://game.example.test",
      Cookie: "apple_worm_session=opaque-session",
    },
  });
  const denied = await fetch(url, {
    method: "POST",
    headers: {
      Origin: "https://attacker.example.test",
      Cookie: "apple_worm_session=opaque-session",
    },
  });
  const missingOrigin = await fetch(url, {
    method: "POST",
    headers: { Cookie: "apple_worm_session=opaque-session" },
  });

  assert.equal(allowed.status, 200);
  assert.equal(denied.status, 403);
  assert.equal(missingOrigin.status, 403);
});
