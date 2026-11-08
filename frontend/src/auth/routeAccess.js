const unavailableRoutes = new Set([
  "/login",
  "/register",
  "/profile",
  "/history",
  "/leaderboard",
  "/wallet",
  "/admin",
]);

export function getRouteAccess(path) {
  if (path === "/dashboard") {
    return { type: "redirect", destination: "/levels" };
  }
  if (unavailableRoutes.has(path) || path.startsWith("/levels/")) {
    return { type: "redirect", destination: "/" };
  }
  return { type: "render" };
}
