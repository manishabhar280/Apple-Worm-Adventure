import jwt from "jsonwebtoken";
import { authCookieName } from "../middleware/authenticate.js";
import { AuthError } from "../services/authService.js";

function getCookieOptions(token) {
  const production = process.env.NODE_ENV === "production";
  const payload = jwt.decode(token);
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/api",
    ...(payload?.exp
      ? { maxAge: Math.max(0, payload.exp * 1000 - Date.now()) }
      : {}),
  };
}

function setSessionCookie(response, token) {
  response.cookie(authCookieName, token, getCookieOptions(token));
}

export function createAuthController(authService) {
  return {
    async register(request, response) {
      const result = await authService.register(request.body);
      setSessionCookie(response, result.token);
      response.status(201).json({ user: result.user });
    },

    async login(request, response) {
      const result = await authService.login(request.body);
      setSessionCookie(response, result.token);
      response.json({ user: result.user });
    },

    getProfile(request, response) {
      response.json({ user: authService.getPublicUser(request.user) });
    },

    async updateProfile(request, response) {
      const user = await authService.updateProfile(
        request.user._id,
        request.body,
      );
      response.json({ user });
    },

    async logout(request, response) {
      await authService.revokeSessions(request.user._id);
      response.clearCookie(authCookieName, getCookieOptions(""));
      response.json({
        message: "Logged out successfully.",
      });
    },
  };
}

export function requireProfileOwner(request, _response, next) {
  if (!request.user?._id) {
    return next(new AuthError(401, "Authentication is required."));
  }
  return next();
}
