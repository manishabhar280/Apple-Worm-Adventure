import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const rewardSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    status: {
      type: String,
      enum: ["pending", "granted", "expired"],
      default: "pending",
      required: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 64,
    },
    referenceId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
    },
    verificationId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
    },
    hintDirection: {
      type: String,
      enum: ["up", "down", "left", "right"],
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, strict: "throw" },
);

rewardSessionSchema.index({ user: 1, createdAt: -1 });
rewardSessionSchema.index(
  { user: 1, rewardType: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: { referenceId: { $type: "string" } },
  },
);

export default registerModel(mongoose, "RewardSession", rewardSessionSchema);
