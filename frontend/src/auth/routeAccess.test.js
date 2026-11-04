import assert from "node:assert/strict";
import test from "node:test";
import { getRouteAccess } from "./routeAccess.js";

test("waits for the saved session before rendering routes", () => {
  assert.deepEqual(getRouteAccess("/dashboard", "loading", null), { type: "wait" });
  assert.deepEqual(getRouteAccess("/dashboard", "error", null), { type: "wait" });
  assert.deepEqual(getRouteAccess("/", "loading", null), { type: "render" });
});

test("redirects anonymous users from all account routes to login", () => {
  for (const path of [
    "/dashboard",
    "/levels",
    "/game",
    "/profile",
    "/history",
    "/leaderboard",
    "/achievements",
    "/wallet",
    "/admin",
  ]) {
    assert.deepEqual(getRouteAccess(path, "anonymous", null), {
      type: "redirect",
      destination: "/login",
    });
  }
  assert.deepEqual(getRouteAccess("/", "anonymous", null), { type: "render" });
});

test("redirects authenticated users away from login and registration", () => {
  for (const path of ["/login", "/register"]) {
    assert.deepEqual(getRouteAccess(path, "authenticated", "player"), {
      type: "redirect",
      destination: "/dashboard",
    });
  }
});

test("allows only administrators into the admin route", () => {
  assert.deepEqual(getRouteAccess("/admin", "authenticated", "player"), {
    type: "redirect",
    destination: "/dashboard",
  });
  assert.deepEqual(getRouteAccess("/admin", "authenticated", "admin"), {
    type: "render",
  });
});
