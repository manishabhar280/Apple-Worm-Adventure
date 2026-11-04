import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const rewardUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rewardType: {
      type: String,
      required: true,
      enum: [
        "revive",
        "double_score",
        "bonus_coins",
        "extra_moves",
        "hint",
        "booster",
      ],
    },
    dayKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    dailyCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    lastGrantedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, strict: "throw" },
);

rewardUsageSchema.index({ user: 1, rewardType: 1 }, { unique: true });

export default registerModel(mongoose, "RewardUsage", rewardUsageSchema);
