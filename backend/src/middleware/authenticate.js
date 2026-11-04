import { AuthError } from "../services/authService.js";

export const authCookieName = "apple_worm_session";

function getCookieToken(request) {
  for (const cookie of (request.headers.cookie || "").split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === authCookieName) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return "";
}

export function createAuthenticate(authService) {
  return async function authenticate(request, _response, next) {
    const authorization = request.get("authorization") || "";
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    const token = match ? match[1] : getCookieToken(request);
    if (!token) {
      return next(new AuthError(401, "A bearer authentication token is required."));
    }

    try {
      request.user = await authService.authenticate(token);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireRole(...roles) {
  return function roleGuard(request, _response, next) {
    if (!request.user) {
      return next(new AuthError(401, "Authentication is required."));
    }
    if (!roles.includes(request.user.role)) {
      return next(new AuthError(403, "You do not have permission to access this resource."));
    }
    return next();
  };
}
