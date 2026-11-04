import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const levelProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    levelNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 10000,
      validate: Number.isInteger,
    },
    status: {
      type: String,
      enum: ["locked", "unlocked", "completed"],
      default: "unlocked",
    },
    bestScore: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    bestMoves: {
      type: Number,
      min: 0,
      validate: {
        validator: (value) => value === undefined || Number.isInteger(value),
        message: "bestMoves must be an integer.",
      },
    },
    stars: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
      validate: Number.isInteger,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, strict: "throw" },
);

levelProgressSchema.index({ user: 1, levelNumber: 1 }, { unique: true });

levelProgressSchema.pre("validate", function validateCompletionDate() {
  if (this.status === "completed" && !this.completedAt) {
    this.invalidate("completedAt", "completedAt is required for completed progress.");
  }
});

export default registerModel(mongoose, "LevelProgress", levelProgressSchema);
