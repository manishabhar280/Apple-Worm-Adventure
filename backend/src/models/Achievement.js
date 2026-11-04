import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const achievementSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9][a-z0-9_-]*$/,
      maxlength: 64,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    icon: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isFinite,
    },
    target: {
      type: Number,
      default: 1,
      min: 1,
      validate: Number.isFinite,
    },
    unlockedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, strict: "throw" },
);

achievementSchema.index({ user: 1, key: 1 }, { unique: true });

export default registerModel(mongoose, "Achievement", achievementSchema);
