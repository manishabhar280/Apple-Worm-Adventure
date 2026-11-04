import { Router } from "express";
import Achievement from "../models/Achievement.js";
import GameSession from "../models/GameSession.js";
import LevelProgress from "../models/LevelProgress.js";
import User from "../models/User.js";
import { createAuthenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { createAchievementController } from "../controllers/achievementController.js";
import { createAuthService } from "../services/authService.js";
import { createAchievementService } from "../services/achievementService.js";

export function createAchievementRouter({
  UserModel = User,
  AchievementModel = Achievement,
  GameSessionModel = GameSession,
  LevelProgressModel = LevelProgress,
  achievementService,
} = {}) {
  const service = achievementService || createAchievementService({
    AchievementModel,
    GameSessionModel,
    LevelProgressModel,
  });
  const authenticate = createAuthenticate(createAuthService({ User: UserModel }));
  const controller = createAchievementController(service);
  const router = Router();

  router.get("/", authenticate, asyncHandler(controller.getAchievements));
  return router;
}
