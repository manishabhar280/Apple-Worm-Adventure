import mongoose from "mongoose";
import AdminAuditLog from "../models/AdminAuditLog.js";
import GameSession from "../models/GameSession.js";
import RewardConfiguration from "../models/RewardConfiguration.js";
import RewardSession from "../models/RewardSession.js";
import User from "../models/User.js";
import WalletTransaction from "../models/WalletTransaction.js";

const editableFields = ["amount", "dailyLimit", "cooldownSeconds"];

function serializeRewardConfiguration(configuration) {
  return {
    rewardType: configuration.rewardType,
    amount: configuration.amount,
    description: configuration.description,
    enabled: configuration.enabled,
    dailyLimit: configuration.dailyLimit,
    cooldownSeconds: configuration.cooldownSeconds,
  };
}

export function createAdminService({
  UserModel = User,
  GameSessionModel = GameSession,
  RewardSessionModel = RewardSession,
  RewardConfigurationModel = RewardConfiguration,
  WalletTransactionModel = WalletTransaction,
  AdminAuditLogModel = AdminAuditLog,
  startSession = () => mongoose.startSession(),
} = {}) {
  return {
    async getDashboard() {
      const [
        users,
        activeUsers,
        gameSessions,
        completedGames,
        failedGames,
        grantedRewards,
        pendingRewards,
        coinTotals,
      ] = await Promise.all([
        UserModel.countDocuments({}),
        UserModel.countDocuments({ isActive: true }),
        GameSessionModel.countDocuments({}),
        GameSessionModel.countDocuments({ status: "completed" }),
        GameSessionModel.countDocuments({ status: "failed" }),
        RewardSessionModel.countDocuments({ status: "granted" }),
        RewardSessionModel.countDocuments({ status: "pending" }),
        WalletTransactionModel.aggregate([
          { $match: { source: "rewarded_ad", type: "credit" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

      return {
        users: { total: users, active: activeUsers },
        gameplay: {
          sessions: gameSessions,
          completed: completedGames,
          failed: failedGames,
        },
        rewards: {
          granted: grantedRewards,
          pending: pendingRewards,
          coinsGranted: coinTotals[0]?.total || 0,
        },
      };
    },

    async updateRewardConfiguration(admin, rewardType, updates) {
      const mongoSession = await startSession();
      let updatedConfiguration;
      let changes = [];
      try {
        await mongoSession.withTransaction(async () => {
          const configuration = await RewardConfigurationModel
            .findOne({ rewardType })
            .session(mongoSession);
          if (!configuration) {
            const error = new Error("Reward configuration was not found.");
            error.statusCode = 404;
            throw error;
          }

          changes = editableFields
            .filter((field) => updates[field] !== undefined &&
              updates[field] !== configuration[field])
            .map((field) => ({
              field,
              before: configuration[field],
              after: updates[field],
            }));
          if (changes.length === 0) {
            updatedConfiguration = serializeRewardConfiguration(configuration);
            return;
          }

          for (const change of changes) {
            configuration[change.field] = change.after;
          }
          await configuration.save({ session: mongoSession });
          await AdminAuditLogModel.create([{
            admin: String(admin._id),
            action: "reward_configuration_updated",
            rewardType,
            changes,
          }], { session: mongoSession });
          updatedConfiguration = serializeRewardConfiguration(configuration);
        });
      } finally {
        await mongoSession.endSession();
      }

      return {
        configuration: updatedConfiguration,
        changes,
      };
    },
  };
}
