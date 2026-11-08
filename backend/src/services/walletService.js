import mongoose from "mongoose";
import GameSession from "../models/GameSession.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import { BOOSTER_CATALOG, BOOSTER_IDS } from "../../../shared/boosterCatalog.js";
import { levels } from "../../../shared/levelData.js";
import { findHint, replayGameActions } from "../../../shared/gameLogic.js";
import { getLevelFeatureBoard } from "../../../shared/levelFeatures.js";

const allowedTransactionSources = new Set(["level", "rewarded_ad", "adjustment", "gameplay"]);
export const HINT_COIN_COST = 5;
const boosterPurchaseReason = (boosterId) => `Booster purchase: ${boosterId}`;

export class WalletError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "WalletError";
    this.statusCode = statusCode;
  }
}

function validateTransaction({ amount, reason, source }) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new WalletError(400, "Transaction amount must be a positive whole number.");
  }
  if (typeof reason !== "string" || reason.trim().length < 2 || reason.trim().length > 200) {
    throw new WalletError(400, "A transaction reason between 2 and 200 characters is required.");
  }
  if (!allowedTransactionSources.has(source)) {
    throw new WalletError(400, "This transaction source is not available.");
  }
}

function isTransactionUnsupported(error) {
  return error?.code === 20 ||
    error?.codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed|does not support transactions/i.test(error?.message || "");
}

export function createWalletService({
  WalletModel = Wallet,
  WalletTransactionModel = WalletTransaction,
  GameSessionModel = GameSession,
  levelDefinitions = levels,
  startSession = () => mongoose.startSession(),
} = {}) {
  async function getOrCreateWallet(userId, session) {
    const options = {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    };
    try {
      return await WalletModel.findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { user: userId, balance: 0, currency: "COIN" } },
        options,
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      const query = WalletModel.findOne({ user: userId });
      return session && typeof query.session === "function"
        ? query.session(session)
        : query;
    }
  }

  async function runAtomic(operation) {
    const session = await startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result;
    } catch (error) {
      if (isTransactionUnsupported(error)) {
        throw new WalletError(
          503,
          "Wallet changes require MongoDB transactions. Use a replica set or MongoDB Atlas.",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async function createTransaction(userId, { type, amount, reason, source, referenceId }, session) {
    const wallet = await getOrCreateWallet(userId, session);
    let updatedWallet;
    if (type === "credit") {
      updatedWallet = await WalletModel.findOneAndUpdate(
        {
          _id: wallet._id,
          user: userId,
          balance: { $lte: Number.MAX_SAFE_INTEGER - amount },
        },
        { $inc: { balance: amount } },
        { new: true, runValidators: true, session },
      );
      if (!updatedWallet) {
        throw new WalletError(409, "This credit would exceed the supported wallet balance.");
      }
    } else {
      updatedWallet = await WalletModel.findOneAndUpdate(
        { _id: wallet._id, user: userId, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, runValidators: true, session },
      );
      if (!updatedWallet) {
        throw new WalletError(409, "Insufficient coin balance.");
      }
    }

    await WalletTransactionModel.create([{
      wallet: updatedWallet._id,
      user: userId,
      type,
      amount,
      source,
      reason: reason.trim(),
      referenceId: referenceId || null,
    }], { session });
    return updatedWallet;
  }

  async function findHintTransaction(userId, requestId, session) {
    let query = WalletTransactionModel.findOne({
      user: userId,
      source: "gameplay",
      referenceId: requestId,
    });
    if (session && typeof query.session === "function") query = query.session(session);
    return query;
  }

  async function findGameplayTransaction(userId, requestId, session) {
    let query = WalletTransactionModel.findOne({
      user: userId,
      source: "gameplay",
      referenceId: requestId,
    });
    if (session && typeof query.session === "function") query = query.session(session);
    return query;
  }

  async function findWallet(userId, session) {
    let query = WalletModel.findOne({ user: userId });
    if (session && typeof query.session === "function") query = query.session(session);
    return query;
  }

  async function findActiveHint(userId, session) {
    let query = GameSessionModel.findOne({
      user: userId,
      status: "in_progress",
    }).sort({ startedAt: -1 });
    if (session && typeof query.session === "function") query = query.session(session);
    const gameSession = await query;
    if (!gameSession) {
      throw new WalletError(409, "An active game session is required to purchase a hint.");
    }

    const level = levelDefinitions[gameSession.levelNumber - 1];
    if (!level) {
      throw new WalletError(409, "The active game session references an unavailable level.");
    }
    const board = getLevelFeatureBoard(level);

    let game;
    try {
      game = replayGameActions(
        board,
        gameSession.actions || [],
        level.moveLimit,
        { strict: true },
      );
    } catch {
      throw new WalletError(409, "The active game session has no valid hint.");
    }
    if (!findHint(game, board, level.moveLimit)) {
      throw new WalletError(409, "No valid hint is available for the active game session.");
    }

    const reservedSession = await GameSessionModel.findOneAndUpdate(
      {
        _id: gameSession._id,
        user: userId,
        status: "in_progress",
        actions: gameSession.actions || [],
      },
      { $set: { updatedAt: new Date() } },
      { new: true, session, timestamps: false },
    );
    if (!reservedSession) {
      throw new WalletError(409, "The active game session changed. Please request a new hint.");
    }
  }

  function serializeInventory(wallet) {
    const inventory = wallet.boosterInventory || {};
    return {
      undo: inventory.undo || 0,
      shield: inventory.shield || 0,
      extra_moves: inventory.extra_moves || 0,
      hint: inventory.hint || 0,
      freeze: inventory.freeze || 0,
    };
  }

  async function getHintPurchase(userId, transaction, session) {
    let query = WalletModel.findOne({ user: userId });
    if (session && typeof query.session === "function") query = query.session(session);
    const wallet = await query;
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      transaction: {
        id: String(transaction._id),
        type: transaction.type,
        amount: transaction.amount,
        reason: transaction.reason,
        source: transaction.source,
        referenceId: transaction.referenceId,
        createdAt: transaction.createdAt,
      },
      duplicate: true,
    };
  }

  return {
    async getBalance(user) {
      const wallet = await getOrCreateWallet(String(user._id));
      return {
        balance: wallet.balance,
        currency: wallet.currency,
      };
    },

    async getBoosterInventory(user) {
      const wallet = await getOrCreateWallet(String(user._id));
      return {
        balance: wallet.balance,
        currency: wallet.currency,
        inventory: serializeInventory(wallet),
        catalog: BOOSTER_IDS.map((boosterId) => BOOSTER_CATALOG[boosterId]),
      };
    },

    async purchaseBooster(user, boosterId, requestId) {
      if (!BOOSTER_IDS.includes(boosterId)) {
        throw new WalletError(400, "That booster is not available.");
      }
      const userId = String(user._id);
      const booster = BOOSTER_CATALOG[boosterId];
      try {
        return await runAtomic(async (session) => {
          const existing = await findGameplayTransaction(userId, requestId, session);
          if (existing) {
            if (existing.reason !== boosterPurchaseReason(boosterId)) {
              throw new WalletError(409, "This purchase request was already used.");
            }
            const wallet = await findWallet(userId, session);
            return {
              balance: wallet.balance,
              currency: wallet.currency,
              inventory: serializeInventory(wallet),
              boosterId,
              transactionId: String(existing._id),
              duplicate: true,
            };
          }

          const wallet = await createTransaction(userId, {
            type: "debit",
            amount: booster.price,
            reason: boosterPurchaseReason(boosterId),
            source: "gameplay",
            referenceId: requestId,
          }, session);
          const updatedWallet = await WalletModel.findOneAndUpdate(
            { user: userId },
            { $inc: { [`boosterInventory.${boosterId}`]: 1 } },
            { new: true, runValidators: true, session },
          );
          return {
            balance: updatedWallet.balance,
            currency: updatedWallet.currency,
            inventory: serializeInventory(updatedWallet),
            boosterId,
            transactionId: String(
              (await findGameplayTransaction(userId, requestId, session))._id,
            ),
            duplicate: false,
          };
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await findGameplayTransaction(userId, requestId);
        if (!existing || existing.reason !== boosterPurchaseReason(boosterId)) throw error;
        const wallet = await findWallet(userId);
        return {
          balance: wallet.balance,
          currency: wallet.currency,
          inventory: serializeInventory(wallet),
          boosterId,
          transactionId: String(existing._id),
          duplicate: true,
        };
      }
    },

    async getTransactions(user, { limit = 100, page = 1 } = {}) {
      const userId = String(user._id);
      const wallet = await getOrCreateWallet(userId);
      const transactions = await WalletTransactionModel.find({
        user: userId,
        wallet: wallet._id,
      })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      return transactions.map((transaction) => ({
        id: String(transaction._id),
        type: transaction.type,
        amount: transaction.amount,
        reason: transaction.reason,
        source: transaction.source,
        referenceId: transaction.referenceId || null,
        createdAt: transaction.createdAt,
      }));
    },

    async credit(userId, transaction) {
      validateTransaction(transaction);
      return runAtomic((session) =>
        createTransaction(userId, { ...transaction, type: "credit" }, session));
    },

    async creditInTransaction(userId, transaction, session) {
      validateTransaction(transaction);
      return createTransaction(userId, { ...transaction, type: "credit" }, session);
    },

    async debit(userId, transaction) {
      validateTransaction(transaction);
      return runAtomic((session) =>
        createTransaction(userId, { ...transaction, type: "debit" }, session));
    },

    async purchaseHint(user, requestId) {
      const userId = String(user._id);
      try {
        return await runAtomic(async (session) => {
          const existing = await findHintTransaction(userId, requestId, session);
          if (existing) {
            if (existing.reason !== "Gameplay hint") {
              throw new WalletError(409, "This purchase request was already used.");
            }
            return getHintPurchase(userId, existing, session);
          }
          await findActiveHint(userId, session);
          const wallet = await createTransaction(userId, {
            type: "debit",
            amount: HINT_COIN_COST,
            reason: "Gameplay hint",
            source: "gameplay",
            referenceId: requestId,
          }, session);
          const transaction = await findHintTransaction(userId, requestId, session);
          return {
            balance: wallet.balance,
            currency: wallet.currency,
            transaction: {
              id: String(transaction._id),
              type: transaction.type,
              amount: transaction.amount,
              reason: transaction.reason,
              source: transaction.source,
              referenceId: transaction.referenceId,
              createdAt: transaction.createdAt,
            },
            duplicate: false,
          };
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await findHintTransaction(userId, requestId);
        if (!existing) throw error;
        if (existing.reason !== "Gameplay hint") {
          throw new WalletError(409, "This purchase request was already used.");
        }
        return getHintPurchase(userId, existing);
      }
    },
  };
}
