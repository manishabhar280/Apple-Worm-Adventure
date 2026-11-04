import { Router } from "express";
import { z } from "zod";
import { createAuthController } from "../controllers/authController.js";
import { createAuthenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createAuthService } from "../services/authService.js";
import User from "../models/User.js";

const registrationSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(72).refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes.",
  ),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(72).refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes.",
  ),
}).strict();

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  avatar: z.string().trim().max(120).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one profile field to update.",
});

export function createAuthRouter({ UserModel = User, authService } = {}) {
  const service = authService || createAuthService({ User: UserModel });
  const controller = createAuthController(service);
  const authenticate = createAuthenticate(service);
  const router = Router();

  router.post(
    "/register",
    validateRequest({ body: registrationSchema }),
    asyncHandler(controller.register),
  );
  router.post(
    "/login",
    validateRequest({ body: loginSchema }),
    asyncHandler(controller.login),
  );
  router.get("/me", authenticate, controller.getProfile);
  router.patch(
    "/me",
    authenticate,
    validateRequest({ body: profileSchema }),
    asyncHandler(controller.updateProfile),
  );
  router.post("/logout", authenticate, controller.logout);

  return router;
}
