import assert from "node:assert/strict";
import test from "node:test";
import { getRouteAccess } from "./routeAccess.js";

test("guest routes render immediately without verifying an account session", () => {
  for (const path of ["/", "/levels", "/game", "/achievements", "/settings"]) {
    assert.deepEqual(getRouteAccess(path), { type: "render" });
  }
});

test("legacy account-only routes return to the guest game without an auth redirect", () => {
  for (const path of [
    "/profile",
    "/history",
    "/leaderboard",
    "/wallet",
    "/admin",
    "/login",
    "/register",
    "/levels/desert",
  ]) {
    assert.deepEqual(getRouteAccess(path), {
      type: "redirect",
      destination: "/",
    });
  }
  assert.deepEqual(getRouteAccess("/dashboard"), {
    type: "redirect",
    destination: "/levels",
  });
});
