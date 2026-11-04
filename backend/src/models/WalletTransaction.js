import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["credit", "debit"],
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    source: {
      type: String,
      required: true,
      enum: ["level", "rewarded_ad", "adjustment", "gameplay"],
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    referenceId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
    },
  },
  { timestamps: true, strict: "throw" },
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index(
  { user: 1, source: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "gameplay",
      referenceId: { $type: "string" },
    },
  },
);

export default registerModel(
  mongoose,
  "WalletTransaction",
  walletTransactionSchema,
);
