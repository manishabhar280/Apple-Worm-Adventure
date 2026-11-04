import { Router } from "express";
import { z } from "zod";
import AdminAuditLog from "../models/AdminAuditLog.js";
import GameSession from "../models/GameSession.js";
import RewardConfiguration from "../models/RewardConfiguration.js";
import RewardSession from "../models/RewardSession.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import { createAuthenticate, requireRole } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createAdminController } from "../controllers/adminController.js";
import { createAuthService } from "../services/authService.js";
import { createAdminService } from "../services/adminService.js";
import { createRewardService } from "../services/rewardService.js";
import { createWalletService } from "../services/walletService.js";

const rewardTypes = ["revive", "double_score", "bonus_coins", "extra_moves", "hint", "booster"];
const rewardTypeParamsSchema = z.object({
  rewardType: z.enum(rewardTypes),
});
const configurationUpdateSchema = z.object({
  amount: z.number().int().safe().min(1).max(1_000_000).optional(),
  dailyLimit: z.number().int().safe().min(0).max(1_000).optional(),
  cooldownSeconds: z.number().int().safe().min(0).max(86_400).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one reward configuration field to update.",
});

export function createAdminRouter({
  UserModel = User,
  GameSessionModel = GameSession,
  RewardSessionModel = RewardSession,
  RewardConfigurationModel = RewardConfiguration,
  WalletModel = Wallet,
  WalletTransactionModel = WalletTransaction,
  AdminAuditLogModel = AdminAuditLog,
  adminService,
  rewardService,
} = {}) {
  const service = adminService || createAdminService({
    UserModel,
    GameSessionModel,
    RewardSessionModel,
    RewardConfigurationModel,
    WalletTransactionModel,
    AdminAuditLogModel,
  });
  const rewards = rewardService || createRewardService({
    RewardConfigurationModel,
    RewardSessionModel,
    GameSessionModel,
    walletService: createWalletService({ WalletModel, WalletTransactionModel }),
  });
  const controller = createAdminController(service, rewards);
  const authenticate = createAuthenticate(createAuthService({ User: UserModel }));
  const router = Router();

  router.use(authenticate, requireRole("admin"));
  router.get("/dashboard", asyncHandler(controller.getDashboard));
  router.get("/reward-configurations", asyncHandler(controller.getRewardConfigurations));
  router.patch(
    "/reward-configurations/:rewardType",
    validateRequest({ params: rewardTypeParamsSchema, body: configurationUpdateSchema }),
    asyncHandler(controller.updateRewardConfiguration),
  );
  return router;
}
