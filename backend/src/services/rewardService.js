import mongoose from "mongoose";
import RewardConfiguration from "../models/RewardConfiguration.js";
import RewardSession from "../models/RewardSession.js";
import RewardUsage from "../models/RewardUsage.js";
import GameSession from "../models/GameSession.js";
import { findHint, replayGameActions } from "../../../shared/gameLogic.js";
import { levels } from "../../../shared/levelData.js";
import { createRewardProvider } from "./rewardProviders.js";

const supportedRewardTypes = new Set(["bonus_coins", "hint"]);
const rewardDefaults = [
  { rewardType: "revive", key: "revive", amount: 1, description: "Continue after a failed level." },
  { rewardType: "double_score", key: "double_score", amount: 2, description: "Double the score from a completed level." },
  { rewardType: "bonus_coins", key: "bonus_coins", amount: 25, description: "Earn bonus coins." },
  { rewardType: "extra_moves", key: "extra_moves", amount: 3, description: "Receive three extra moves." },
  { rewardType: "hint", key: "hint", amount: 1, description: "Unlock one hint." },
  { rewardType: "booster", key: "booster", amount: 1, description: "Receive one booster." },
].map((config) => ({
  ...config,
  enabled: true,
  dailyLimit: 3,
  cooldownSeconds: 60,
}));

const referenceSessionStatuses = {
  revive: "failed",
  double_score: "completed",
  bonus_coins: null,
  extra_moves: "in_progress",
  hint: "in_progress",
  booster: "in_progress",
};

function currentUtcDay(date) {
  return date.toISOString().slice(0, 10);
}

function toPublicConfiguration(config, provider) {
  return {
    rewardType: config.rewardType,
    amount: config.amount,
    description: config.description,
    enabled: config.enabled &&
      supportedRewardTypes.has(config.rewardType) &&
      provider.name !== "unconfigured",
    dailyLimit: config.dailyLimit,
    cooldownSeconds: config.cooldownSeconds,
  };
}

function toPublicReward(session) {
  return {
    id: String(session._id),
    rewardType: session.rewardType,
    amount: session.amount,
    status: session.status,
    provider: session.provider,
    referenceId: session.referenceId || null,
    createdAt: session.createdAt,
    verifiedAt: session.verifiedAt,
  };
}

function duplicateRewardError(error) {
  if (error?.code === 11000) {
    const duplicate = new Error("A reward was already requested for this game session.");
    duplicate.statusCode = 409;
    return duplicate;
  }
  return error;
}

export function createRewardService({
  RewardConfigurationModel = RewardConfiguration,
  RewardSessionModel = RewardSession,
  RewardUsageModel = RewardUsage,
  GameSessionModel = GameSession,
  walletService,
  provider = createRewardProvider(),
  startSession = () => mongoose.startSession(),
  sessionLifetimeSeconds = 300,
  now = () => new Date(),
} = {}) {
  if (
    !provider ||
    typeof provider.name !== "string" ||
    typeof provider.isSimulation !== "boolean" ||
    typeof provider.verify !== "function"
  ) {
    throw new Error("Reward providers must implement name, isSimulation, and verify().");
  }

  async function ensureDefaults() {
    const enabledByDefault = provider.name === "development_simulation";
    for (const reward of rewardDefaults) {
      await RewardConfigurationModel.updateOne(
        { rewardType: reward.rewardType },
        { $setOnInsert: { ...reward, enabled: enabledByDefault } },
        { upsert: true },
      );
    }
    return RewardConfigurationModel.find({}).sort({ rewardType: 1 });
  }

  async function getRewardConfiguration() {
    const configs = await ensureDefaults();
    return {
      provider: provider.name,
      simulated: provider.isSimulation,
      rewards: configs.map((config) => toPublicConfiguration(config, provider)),
    };
  }

  async function checkEligibility(userId, rewardType, config, referenceId) {
    if (config.dailyLimit === 0) {
      const error = new Error("This reward is not currently available.");
      error.statusCode = 404;
      throw error;
    }
    const expectedStatus = referenceSessionStatuses[rewardType];
    if (expectedStatus && !referenceId) {
      const error = new Error("This reward requires a related game session.");
      error.statusCode = 400;
      throw error;
    }
    if (expectedStatus) {
      const gameSession = await GameSessionModel.findOne({
        _id: referenceId,
        user: userId,
        status: expectedStatus,
      });
      if (!gameSession) {
        const error = new Error("The referenced game session is not eligible for this reward.");
        error.statusCode = 409;
        throw error;
      }
    }

    const currentTime = now();
    const usage = await RewardUsageModel.findOne({ user: userId, rewardType });
    const countToday = usage?.dayKey === currentUtcDay(currentTime)
      ? usage.dailyCount
      : 0;
    if (countToday >= config.dailyLimit) {
      const error = new Error("The daily limit for this reward has been reached.");
      error.statusCode = 429;
      throw error;
    }
    if (
      usage?.lastGrantedAt &&
      currentTime.getTime() - usage.lastGrantedAt.getTime() < config.cooldownSeconds * 1000
    ) {
      const waitSeconds = Math.ceil(
        (config.cooldownSeconds * 1000 -
          (currentTime.getTime() - usage.lastGrantedAt.getTime())) / 1000,
      );
      const error = new Error(`This reward is on cooldown. Try again in ${waitSeconds} seconds.`);
      error.statusCode = 429;
      throw error;
    }
  }

  return {
    provider,

    async getConfiguration() {
      return getRewardConfiguration();
    },

    async startReward(user, { rewardType, referenceId }) {
      const userId = String(user._id);
      if (!provider.isSimulation && provider.name === "unconfigured") {
        const error = new Error("Rewarded ads are unavailable because no ad provider is configured.");
        error.statusCode = 503;
        throw error;
      }
      const configs = await ensureDefaults();
      const config = configs.find((entry) => entry.rewardType === rewardType);
      if (!config || !config.enabled) {
        const error = new Error("This reward is not currently available.");
        error.statusCode = 404;
        throw error;
      }
      if (!supportedRewardTypes.has(rewardType)) {
        const error = new Error("This reward benefit is not supported by gameplay yet.");
        error.statusCode = 404;
        throw error;
      }
      await checkEligibility(userId, rewardType, config, referenceId);

      try {
        const session = await RewardSessionModel.create({
          user: userId,
          rewardType,
          amount: config.amount,
          status: "pending",
          provider: provider.name,
          referenceId: referenceId || null,
          expiresAt: new Date(now().getTime() + sessionLifetimeSeconds * 1000),
        });
        return {
          rewardSession: toPublicReward(session),
          simulation: provider.isSimulation
            ? {
                enabled: true,
                label: "Development simulation — no real ad is shown.",
                minimumWatchSeconds: provider.minimumWatchSeconds,
              }
            : { enabled: false },
        };
      } catch (error) {
        throw duplicateRewardError(error);
      }
    },

    async verifyReward(user, sessionId) {
      const userId = String(user._id);
      const rewardSession = await RewardSessionModel.findOne({
        _id: sessionId,
        user: userId,
      });
      if (!rewardSession) {
        const error = new Error("Reward session was not found.");
        error.statusCode = 404;
        throw error;
      }
      if (rewardSession.status !== "pending") {
        const error = new Error("This reward session has already been claimed or expired.");
        error.statusCode = 409;
        throw error;
      }
      const currentTime = now();
      if (rewardSession.expiresAt <= currentTime) {
        rewardSession.status = "expired";
        await rewardSession.save();
        const error = new Error("This reward session has expired.");
        error.statusCode = 410;
        throw error;
      }

      const verification = await provider.verify(rewardSession, currentTime);
      if (!verification?.verified || verification.provider !== provider.name) {
        const error = new Error("The ad provider could not verify this reward.");
        error.statusCode = 403;
        throw error;
      }

      const configs = await ensureDefaults();
      const config = configs.find((entry) => entry.rewardType === rewardSession.rewardType);
      if (!config || !config.enabled) {
        const error = new Error("This reward is no longer available.");
        error.statusCode = 409;
        throw error;
      }
      await checkEligibility(userId, rewardSession.rewardType, config, rewardSession.referenceId);

      const mongoSession = await startSession();
      let gameplayEffect = null;
      try {
        let updated;
        await mongoSession.withTransaction(async () => {
          const claimTime = now();
          const current = await RewardSessionModel.findOne({
            _id: sessionId,
            user: userId,
            status: "pending",
            expiresAt: { $gt: claimTime },
          }).session(mongoSession);
          if (!current) {
            const error = new Error("This reward session has already been claimed or expired.");
            error.statusCode = 409;
            throw error;
          }

          const expectedStatus = referenceSessionStatuses[current.rewardType];
          let eligibleGameSession = null;
          if (expectedStatus) {
            eligibleGameSession = await GameSessionModel.findOne({
              _id: current.referenceId,
              user: userId,
              status: expectedStatus,
            }).session(mongoSession);
            if (!eligibleGameSession) {
              const error = new Error("The referenced game session is no longer eligible for this reward.");
              error.statusCode = 409;
              throw error;
            }
          }
          if (current.rewardType === "hint") {
            const level = levels[eligibleGameSession.levelNumber - 1];
            const state = replayGameActions(
              level.board,
              eligibleGameSession.actions || [],
              level.moveLimit,
            );
            const direction = findHint(state, level.board, level.moveLimit);
            if (!direction) {
              const error = new Error("No safe hint is available for this game position.");
              error.statusCode = 409;
              throw error;
            }
            current.hintDirection = direction;
            gameplayEffect = { type: "hint", direction };
          }

          let usage = await RewardUsageModel.findOne({
            user: userId,
            rewardType: current.rewardType,
          }).session(mongoSession);
          if (!usage) {
            usage = new RewardUsageModel({
              user: userId,
              rewardType: current.rewardType,
              dayKey: currentUtcDay(currentTime),
              dailyCount: 0,
            });
          }
          if (usage.dayKey !== currentUtcDay(claimTime)) {
            usage.dayKey = currentUtcDay(claimTime);
            usage.dailyCount = 0;
          }
          if (usage.dailyCount >= config.dailyLimit) {
            const error = new Error("The daily limit for this reward has been reached.");
            error.statusCode = 429;
            throw error;
          }
          if (
            usage.lastGrantedAt &&
            claimTime.getTime() - usage.lastGrantedAt.getTime() < config.cooldownSeconds * 1000
          ) {
            const error = new Error("This reward is still on cooldown.");
            error.statusCode = 429;
            throw error;
          }

          usage.dailyCount += 1;
          usage.lastGrantedAt = claimTime;
          await usage.save({ session: mongoSession });

          current.status = "granted";
          current.verificationId = verification.verificationId;
          current.verifiedAt = verification.verifiedAt;
          await current.save({ session: mongoSession });

          if (current.rewardType === "bonus_coins") {
            await walletService.creditInTransaction(
              userId,
              {
                amount: current.amount,
                reason: "Rewarded ad bonus coins",
                source: "rewarded_ad",
                referenceId: String(current._id),
              },
              mongoSession,
            );
          }
          updated = current;
        });
        return {
          rewardSession: toPublicReward(updated),
          simulation: provider.isSimulation,
          gameplayEffect,
        };
      } finally {
        await mongoSession.endSession();
      }
    },

    async getHistory(user, { limit = 50, page = 1 } = {}) {
      const history = await RewardSessionModel.find({ user: String(user._id) })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      return history.map(toPublicReward);
    },
  };
}
