import { Router } from "express";
import { z } from "zod";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import User from "../models/User.js";
import { createAuthenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createAuthService } from "../services/authService.js";
import { createWalletController } from "../controllers/walletController.js";
import { createWalletService } from "../services/walletService.js";

const transactionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
}).strict();
const hintPurchaseSchema = z.object({
  requestId: z.string().uuid(),
}).strict();
const boosterPurchaseSchema = z.object({
  boosterId: z.enum(["undo", "shield", "extra_moves", "hint", "freeze"]),
  requestId: z.string().uuid(),
}).strict();

export function createWalletRouter({
  UserModel = User,
  WalletModel = Wallet,
  WalletTransactionModel = WalletTransaction,
  walletService,
} = {}) {
  const service = walletService || createWalletService({
    WalletModel,
    WalletTransactionModel,
  });
  const authenticate = createAuthenticate(createAuthService({ User: UserModel }));
  const controller = createWalletController(service);
  const router = Router();

  router.get("/balance", authenticate, asyncHandler(controller.getBalance));
  router.get("/boosters", authenticate, asyncHandler(controller.getBoosterInventory));
  router.post(
    "/boosters",
    authenticate,
    validateRequest({ body: boosterPurchaseSchema }),
    asyncHandler(controller.purchaseBooster),
  );
  router.post(
    "/hints",
    authenticate,
    validateRequest({ body: hintPurchaseSchema }),
    asyncHandler(controller.purchaseHint),
  );
  router.get(
    "/transactions",
    authenticate,
    validateRequest({ query: transactionQuerySchema }),
    asyncHandler(controller.getTransactions),
  );

  return router;
}
