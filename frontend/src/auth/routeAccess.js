const accountPaths = new Set([
  "/dashboard",
  "/levels",
  "/game",
  "/profile",
  "/history",
  "/leaderboard",
  "/achievements",
  "/wallet",
  "/admin",
]);

export function getRouteAccess(path, authStatus, role) {
  const needsVerifiedSession =
    accountPaths.has(path) || path === "/login" || path === "/register";
  if (
    needsVerifiedSession &&
    (authStatus === "loading" || authStatus === "error")
  ) {
    return { type: "wait" };
  }

  if (authStatus !== "authenticated") {
    return accountPaths.has(path)
      ? { type: "redirect", destination: "/login" }
      : { type: "render" };
  }

  if (path === "/login" || path === "/register") {
    return { type: "redirect", destination: "/dashboard" };
  }

  if (path === "/admin" && role !== "admin") {
    return { type: "redirect", destination: "/dashboard" };
  }

  return { type: "render" };
}
