import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    currency: {
      type: String,
      required: true,
      enum: ["COIN"],
      default: "COIN",
    },
    boosterInventory: {
      undo: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
      shield: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
      extra_moves: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
      hint: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
      freeze: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    },
  },
  { timestamps: true, strict: "throw", minimize: false },
);

export default registerModel(mongoose, "Wallet", walletSchema);
