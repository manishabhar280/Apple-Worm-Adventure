import { AuthError } from "../services/authService.js";
import { authCookieName } from "./authenticate.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function verifyRequestOrigin(request, _response, next) {
  if (safeMethods.has(request.method)) {
    return next();
  }

  const origin = request.get("origin");
  const allowedOrigins = new Set([
    process.env.FRONTEND_ORIGIN ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173"),
    "https://localhost",
  ].filter(Boolean));
  const hasSessionCookie = (request.headers.cookie || "")
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${authCookieName}=`));

  if (
    (origin && !allowedOrigins.has(origin)) ||
    (hasSessionCookie && !allowedOrigins.has(origin))
  ) {
    return next(new AuthError(403, "The request origin is not allowed."));
  }

  return next();
}
