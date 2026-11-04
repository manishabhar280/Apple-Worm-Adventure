import mongoose from "mongoose";
import { registerModel } from "./modelHelpers.js";

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 20,
      select: false,
    },
    role: {
      type: String,
      enum: ["player", "admin"],
      default: "player",
      required: true,
      index: true,
    },
    avatar: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  { timestamps: true, strict: "throw" },
);

export default registerModel(mongoose, "User", userSchema);
