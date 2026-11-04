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
  },
  { timestamps: true, strict: "throw" },
);

export default registerModel(mongoose, "Wallet", walletSchema);
