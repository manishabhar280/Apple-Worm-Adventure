import { Router } from "express";
import { z } from "zod";
import Achievement from "../models/Achievement.js";
import GameSession from "../models/GameSession.js";
import LevelProgress from "../models/LevelProgress.js";
import User from "../models/User.js";
import { createAuthenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createPlayerController } from "../controllers/playerController.js";
import { createPlayerService } from "../services/playerService.js";
import { createAuthService } from "../services/authService.js";
import { createAchievementService } from "../services/achievementService.js";

const startSessionSchema = z.object({
  levelNumber: z.number().int().min(1).max(50),
}).strict();

const sessionParamsSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
});

const sessionActionsSchema = z.object({
  actions: z.array(z.enum(["up", "down", "left", "right"])).max(1000),
}).strict();

export function createPlayerRouter({
  UserModel = User,
  LevelProgressModel = LevelProgress,
  GameSessionModel = GameSession,
  AchievementModel = Achievement,
  playerService,
  achievementService,
} = {}) {
  const service = playerService || createPlayerService({
    User: UserModel,
    LevelProgress: LevelProgressModel,
    GameSession: GameSessionModel,
    achievementService: achievementService || createAchievementService({
      AchievementModel,
      GameSessionModel,
      LevelProgressModel,
    }),
  });
  const controller = createPlayerController(service);
  const authenticate = createAuthenticate(createAuthService({ User: UserModel }));
  const router = Router();

  router.get("/progress", authenticate, asyncHandler(controller.getProgress));
  router.post(
    "/sessions",
    authenticate,
    validateRequest({ body: startSessionSchema }),
    asyncHandler(controller.startSession),
  );
  router.put(
    "/sessions/:sessionId/actions",
    authenticate,
    validateRequest({ params: sessionParamsSchema, body: sessionActionsSchema }),
    asyncHandler(controller.saveSessionActions),
  );
  router.get("/dashboard", authenticate, asyncHandler(controller.getDashboard));
  router.get("/history", authenticate, asyncHandler(controller.getHistory));
  router.get("/leaderboard", asyncHandler(controller.getLeaderboard));

  return router;
}
