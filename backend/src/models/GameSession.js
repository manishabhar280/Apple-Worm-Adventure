import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const gameSessionSchema = new mongoose.Schema(
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
      enum: ["in_progress", "completed", "failed", "abandoned"],
      default: "in_progress",
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    moves: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    applesCollected: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
      validate: {
        validator(value) {
          return !value || !this.startedAt || value >= this.startedAt;
        },
        message: "endedAt cannot be earlier than startedAt.",
      },
    },
    stars: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
      validate: Number.isInteger,
    },
    actions: {
      type: [String],
      enum: ["up", "down", "left", "right"],
      default: [],
      validate: {
        validator: (actions) => actions.length <= 1000,
        message: "A game session cannot contain more than 1000 actions.",
      },
    },
  },
  { timestamps: true, strict: "throw" },
);

gameSessionSchema.index({ user: 1, startedAt: -1 });

gameSessionSchema.pre("validate", function validateEndDate() {
  if (this.status !== "in_progress" && !this.endedAt) {
    this.invalidate("endedAt", "endedAt is required for a finished session.");
  }
});

export default registerModel(mongoose, "GameSession", gameSessionSchema);
