import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const rewardConfigurationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9][a-z0-9_-]*$/,
      maxlength: 64,
      unique: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
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
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    dailyLimit: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    cooldownSeconds: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  { timestamps: true, strict: "throw" },
);

export default registerModel(
  mongoose,
  "RewardConfiguration",
  rewardConfigurationSchema,
);
