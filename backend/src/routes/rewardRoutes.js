import { Router } from "express";
import { z } from "zod";
import GameSession from "../models/GameSession.js";
import RewardConfiguration from "../models/RewardConfiguration.js";
import RewardSession from "../models/RewardSession.js";
import RewardUsage from "../models/RewardUsage.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import { createAuthenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createAuthService } from "../services/authService.js";
import { createRewardController } from "../controllers/rewardController.js";
import { createRewardService } from "../services/rewardService.js";
import { createWalletService } from "../services/walletService.js";

const rewardTypes = [
  "revive",
  "double_score",
  "bonus_coins",
  "extra_moves",
  "hint",
  "booster",
];
const startRewardSchema = z.object({
  rewardType: z.enum(rewardTypes),
  referenceId: z.string().trim().min(1).max(128).optional(),
}).strict();
const sessionParamsSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
});
const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
}).strict();

export function createRewardRouter({
  UserModel = User,
  RewardConfigurationModel = RewardConfiguration,
  RewardSessionModel = RewardSession,
  RewardUsageModel = RewardUsage,
  GameSessionModel = GameSession,
  WalletModel = Wallet,
  WalletTransactionModel = WalletTransaction,
  rewardService,
} = {}) {
  const service = rewardService || createRewardService({
    RewardConfigurationModel,
    RewardSessionModel,
    RewardUsageModel,
    GameSessionModel,
    walletService: createWalletService({ WalletModel, WalletTransactionModel }),
  });
  const authenticate = createAuthenticate(createAuthService({ User: UserModel }));
  const controller = createRewardController(service);
  const router = Router();

  router.use(authenticate);
  router.get("/configuration", asyncHandler(controller.getConfiguration));
  router.post(
    "/sessions",
    validateRequest({ body: startRewardSchema }),
    asyncHandler(controller.startReward),
  );
  router.post(
    "/sessions/:sessionId/verify",
    validateRequest({ params: sessionParamsSchema }),
    asyncHandler(controller.verifyReward),
  );
  router.get(
    "/history",
    validateRequest({ query: historyQuerySchema }),
    asyncHandler(controller.getHistory),
  );

  return router;
}
