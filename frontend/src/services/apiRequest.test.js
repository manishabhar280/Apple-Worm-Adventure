import assert from "node:assert/strict";
import test from "node:test";
import { createApiRequest } from "./apiRequest.js";

test("sends credentials for HttpOnly cookie sessions", async () => {
  let requestOptions;
  const request = createApiRequest({
    apiBaseUrl: "https://api.example.org",
    fetchImplementation: async (_url, options) => {
      requestOptions = options;
      return { ok: true, json: async () => ({ user: { id: "player-1" } }) };
    },
  });

  await request("/api/auth/me", { token: "not-sent-to-the-browser-storage-or-request" });
  assert.equal(requestOptions.credentials, "include");
  assert.equal(requestOptions.headers.Authorization, undefined);
});

test("forwards the keepalive option used to flush progress on page exit", async () => {
  let requestOptions;
  const request = createApiRequest({
    fetchImplementation: async (_url, options) => {
      requestOptions = options;
      return { ok: true, json: async () => ({}) };
    },
  });

  await request("/api/player/sessions/session-1/actions", {
    method: "PUT",
    body: JSON.stringify({ actions: ["right"] }),
    keepalive: true,
  });

  assert.equal(requestOptions.keepalive, true);
});

test("turns expired sessions into a frontend session-expired event", async () => {
  let expired = false;
  const request = createApiRequest({
    fetchImplementation: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Session expired." } }),
    }),
    onUnauthorized: () => {
      expired = true;
    },
  });

  await assert.rejects(request("/api/player/dashboard"), {
    message: "Session expired.",
    status: 401,
  });
  assert.equal(expired, true);
});

test("does not expire an existing session for rejected login credentials", async () => {
  let expired = false;
  const request = createApiRequest({
    fetchImplementation: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid credentials." } }),
    }),
    onUnauthorized: () => {
      expired = true;
    },
  });

  await assert.rejects(request("/api/auth/login"), { status: 401 });
  assert.equal(expired, false);
});
