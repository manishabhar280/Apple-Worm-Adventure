import assert from "node:assert/strict";
import test from "node:test";
import app from "../app.js";
import { closeDatabase } from "../config/database.js";

test("health endpoint reports backend and unavailable database status", async () => {
  await closeDatabase();
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const health = await response.json();

    assert.equal(response.status, 503);
    assert.equal(health.status, "degraded");
    assert.equal(health.backend.status, "ok");
    assert.equal(health.database.status, "disconnected");
    assert.equal(health.database.connected, false);
    assert.ok(Number.isFinite(Date.parse(health.timestamp)));
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("liveness stays healthy while readiness waits for MongoDB", async () => {
  await closeDatabase();
  const server = app.listen(0);
  try {
    const address = server.address();
    const [liveResponse, readyResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${address.port}/api/health/live`),
      fetch(`http://127.0.0.1:${address.port}/api/health/ready`),
    ]);
    assert.equal(liveResponse.status, 200);
    assert.equal((await liveResponse.json()).status, "ok");
    assert.equal(readyResponse.status, 503);
    assert.equal((await readyResponse.json()).database.connected, false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("CORS exposes API responses only to the configured frontend and Capacitor origins", async () => {
  const originalOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = "https://game.example.test";
  const server = app.listen(0);
  try {
    const address = server.address();
    const [allowedResponse, capacitorResponse, deniedResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${address.port}/api/health/live`, {
        headers: { Origin: "https://game.example.test" },
      }),
      fetch(`http://127.0.0.1:${address.port}/api/health/live`, {
        headers: { Origin: "https://localhost" },
      }),
      fetch(`http://127.0.0.1:${address.port}/api/health/live`, {
        headers: { Origin: "https://other.example.test" },
      }),
    ]);
    assert.equal(allowedResponse.headers.get("access-control-allow-origin"), "https://game.example.test");
    assert.equal(allowedResponse.headers.get("access-control-allow-credentials"), "true");
    assert.equal(capacitorResponse.headers.get("access-control-allow-origin"), "https://localhost");
    assert.equal(capacitorResponse.headers.get("access-control-allow-credentials"), "true");
    assert.equal(deniedResponse.headers.get("access-control-allow-origin"), null);
  } finally {
    if (originalOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalOrigin;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("unknown API routes use the centralized 404 response", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.match(body.error.message, /Route not found/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
