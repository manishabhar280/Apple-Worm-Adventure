import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Achievement from "./Achievement.js";
import AdminAuditLog from "./AdminAuditLog.js";
import GameSession from "./GameSession.js";
import LevelProgress from "./LevelProgress.js";
import RewardConfiguration from "./RewardConfiguration.js";
import RewardSession from "./RewardSession.js";
import RewardUsage from "./RewardUsage.js";
import User from "./User.js";
import Wallet from "./Wallet.js";
import WalletTransaction from "./WalletTransaction.js";

const userId = new mongoose.Types.ObjectId();
const walletId = new mongoose.Types.ObjectId();

async function assertInvalid(document) {
  await assert.rejects(document.validate(), { name: "ValidationError" });
}

test("models use timestamps and the requested references", () => {
  const models = [
    User,
    LevelProgress,
    GameSession,
    Achievement,
    AdminAuditLog,
    Wallet,
    WalletTransaction,
    RewardConfiguration,
    RewardSession,
    RewardUsage,
  ];

  for (const model of models) {
    assert.equal(model.schema.options.timestamps, true, model.modelName);
  }

  assert.equal(LevelProgress.schema.path("user").options.ref, "User");
  assert.equal(GameSession.schema.path("user").options.ref, "User");
  assert.equal(Achievement.schema.path("user").options.ref, "User");
  assert.equal(AdminAuditLog.schema.path("admin").options.ref, "User");
  assert.equal(Wallet.schema.path("user").options.ref, "User");
  assert.equal(WalletTransaction.schema.path("wallet").options.ref, "Wallet");
  assert.equal(WalletTransaction.schema.path("user").options.ref, "User");
  assert.equal(RewardSession.schema.path("user").options.ref, "User");
  assert.equal(RewardUsage.schema.path("user").options.ref, "User");
});

test("user validates and normalizes its required profile fields", async () => {
  const valid = new User({
    displayName: "  Apple Player ",
    email: "PLAYER@EXAMPLE.TEST",
    passwordHash: "a".repeat(60),
  });
  await valid.validate();
  assert.equal(valid.displayName, "Apple Player");
  assert.equal(valid.email, "player@example.test");
  assert.equal(valid.tokenVersion, 0);

  const invalid = new User({
    displayName: "A",
    email: "not-an-email",
    passwordHash: "short",
  });
  await assertInvalid(invalid);
});

test("level and session schemas reject invalid scores, stars, status, and completion dates", async () => {
  const invalidProgress = new LevelProgress({
    user: userId,
    levelNumber: 1.5,
    bestScore: -1,
    stars: 4,
  });
  await assertInvalid(invalidProgress);

  const missingCompletionDate = new LevelProgress({
    user: userId,
    levelNumber: 1,
    status: "completed",
  });
  await assertInvalid(missingCompletionDate);

  const invalidSession = new GameSession({
    user: userId,
    levelNumber: 1,
    status: "unknown",
    score: -3,
    moves: 2.5,
  });
  await assertInvalid(invalidSession);

  const missingEndDate = new GameSession({
    user: userId,
    levelNumber: 1,
    status: "failed",
  });
  await assertInvalid(missingEndDate);
});

test("wallet-related schemas require valid references and positive integer amounts", async () => {
  const invalidWallet = new Wallet({ user: userId, balance: -1 });
  await assertInvalid(invalidWallet);

  const invalidTransaction = new WalletTransaction({
    wallet: walletId,
    user: userId,
    type: "credit",
    amount: 0,
    source: "unknown",
  });
  await assertInvalid(invalidTransaction);
  await new WalletTransaction({
    wallet: walletId,
    user: userId,
    type: "debit",
    amount: 5,
    source: "gameplay",
    reason: "Gameplay hint",
    referenceId: "request-key",
  }).validate();
  assert.ok(WalletTransaction.schema.indexes().some(([keys, options]) =>
    keys.user === 1 && keys.source === 1 && keys.referenceId === 1 &&
    options.unique === true && options.partialFilterExpression?.source === "gameplay"));

  const invalidConfig = new RewardConfiguration({
    key: "rewarded-ad",
    description: "Test configuration",
    rewardType: "bonus_coins",
    amount: -1,
  });
  await assertInvalid(invalidConfig);

  await assertInvalid(new RewardSession({
    user: userId,
    rewardType: "bonus_coins",
    amount: 0,
    provider: "unconfigured",
    expiresAt: new Date(),
  }));
  await assertInvalid(new RewardUsage({
    user: userId,
    rewardType: "bonus_coins",
    dayKey: "not-a-date",
    dailyCount: -1,
  }));
});

test("achievement requires a user relationship and valid progress bounds", async () => {
  const invalid = new Achievement({
    user: userId,
    key: "first-apple",
    title: "First Apple",
    description: "Collect the first apple.",
    progress: -1,
    target: 0,
  });
  await assertInvalid(invalid);
});

test("admin audit entries require a valid admin, reward, action, and change", async () => {
  const valid = new AdminAuditLog({
    admin: userId,
    action: "reward_configuration_updated",
    rewardType: "bonus_coins",
    changes: [{ field: "amount", before: 25, after: 30 }],
  });
  await valid.validate();

  await assertInvalid(new AdminAuditLog({
    admin: userId,
    action: "unknown",
    rewardType: "bonus_coins",
    changes: [],
  }));
});
