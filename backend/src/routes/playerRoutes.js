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
import { levels, TOTAL_LEVELS } from "../../../shared/levelData.js";
import { BOOSTER_ACTIONS } from "../../../shared/boosterCatalog.js";
import Wallet from "../models/Wallet.js";

const startSessionSchema = z.object({
  levelNumber: z.number().int().min(1).max(TOTAL_LEVELS),
}).strict();

const sessionParamsSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
});

const sessionActionsSchema = z.object({
  actions: z.array(z.enum([
    "up",
    "down",
    "left",
    "right",
    ...BOOSTER_ACTIONS,
  ])).max(2000),
}).strict();

export function createPlayerRouter({
  UserModel = User,
  LevelProgressModel = LevelProgress,
  GameSessionModel = GameSession,
  WalletModel = Wallet,
  AchievementModel = Achievement,
  levelDefinitions = levels,
  startSession,
  playerService,
  achievementService,
} = {}) {
  const service = playerService || createPlayerService({
    User: UserModel,
    LevelProgress: LevelProgressModel,
    GameSession: GameSessionModel,
    WalletModel,
    levels: levelDefinitions,
    startSession,
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
