import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const auditChangeSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
      enum: ["amount", "dailyLimit", "cooldownSeconds"],
    },
    before: { type: Number, required: true, min: 0 },
    after: { type: Number, required: true, min: 0 },
  },
  { _id: false, strict: "throw" },
);

const adminAuditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: ["reward_configuration_updated"],
    },
    rewardType: {
      type: String,
      required: true,
      enum: ["revive", "double_score", "bonus_coins", "extra_moves", "hint", "booster"],
    },
    changes: {
      type: [auditChangeSchema],
      required: true,
      validate: (changes) => changes.length > 0,
    },
  },
  { timestamps: true, strict: "throw" },
);

adminAuditLogSchema.index({ admin: 1, createdAt: -1 });
adminAuditLogSchema.index({ rewardType: 1, createdAt: -1 });

export default registerModel(mongoose, "AdminAuditLog", adminAuditLogSchema);
