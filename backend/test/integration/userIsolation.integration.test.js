import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import test from "node:test";
import { TOTAL_LEVELS } from "../../../shared/levelData.js";
import GameSession from "../../src/models/GameSession.js";
import RewardSession from "../../src/models/RewardSession.js";
import Wallet from "../../src/models/Wallet.js";
import WalletTransaction from "../../src/models/WalletTransaction.js";
import {
  createIntegrationContext,
  databaseTestSkipReason,
} from "./mongoTestSupport.js";

const integrationJwtSecret = "isolated-mongodb-integration-secret-0123456789";

test("isolates another player's sessions, progress, rewards, and wallet", {
  skip: databaseTestSkipReason,
}, async (t) => {
  const context = await createIntegrationContext({ databaseSuffix: "isolation" });
  t.after(context.close);

  const first = await context.register("First Player");
  const second = await context.register("Second Player");
  const firstCookie = (await context.login(first.email, first.password)).cookie;
  const secondCookie = (await context.login(second.email, second.password)).cookie;

  const firstSession = await context.request("/api/player/sessions", {
    method: "POST",
    cookie: firstCookie,
    body: { levelNumber: 1 },
  });
  assert.equal(firstSession.response.status, 201);
  await context.request(`/api/player/sessions/${firstSession.body.session.id}/actions`, {
    method: "PUT",
    cookie: firstCookie,
    body: { actions: ["right"] },
  });

  const stolenSession = await context.request(
    `/api/player/sessions/${firstSession.body.session.id}/actions`,
    { method: "PUT", cookie: secondCookie, body: { actions: [] } },
  );
  const firstProgress = await context.request("/api/player/progress", { cookie: firstCookie });
  const secondProgress = await context.request("/api/player/progress", { cookie: secondCookie });
  assert.equal(stolenSession.response.status, 404);
  assert.equal(firstProgress.body.activeSession.id, firstSession.body.session.id);
  assert.equal(secondProgress.body.activeSession, null);

  const firstWallet = await Wallet.create({
    user: first.body.user.id,
    balance: 17,
    currency: "COIN",
  });
  await WalletTransaction.create({
    wallet: firstWallet._id,
    user: first.body.user.id,
    type: "credit",
    amount: 17,
    source: "adjustment",
    reason: "Integration fixture",
  });

  const ownBalance = await context.request("/api/wallet/balance", { cookie: firstCookie });
  const otherBalance = await context.request("/api/wallet/balance", { cookie: secondCookie });
  const otherTransactions = await context.request("/api/wallet/transactions", {
    cookie: secondCookie,
  });
  assert.equal(ownBalance.body.balance, 17);
  assert.equal(otherBalance.body.balance, 0);
  assert.equal(otherTransactions.body.transactions.length, 0);

  const forgedOwner = await context.request("/api/wallet/hints", {
    method: "POST",
    cookie: secondCookie,
    body: { requestId: randomUUID(), userId: first.body.user.id },
  });
  assert.equal(forgedOwner.response.status, 400);
  assert.equal((await context.request("/api/wallet/balance", { cookie: firstCookie })).body.balance, 17);

  const firstReward = await context.request("/api/rewards/sessions", {
    method: "POST",
    cookie: firstCookie,
    body: { rewardType: "bonus_coins" },
  });
  assert.equal(firstReward.response.status, 201);
  const stolenReward = await context.request(
    `/api/rewards/sessions/${firstReward.body.rewardSession.id}/verify`,
    { method: "POST", cookie: secondCookie, body: {} },
  );
  const secondRewardHistory = await context.request("/api/rewards/history", {
    cookie: secondCookie,
  });
  assert.equal(stolenReward.response.status, 404);
  assert.equal(secondRewardHistory.body.rewards.length, 0);
  assert.equal(
    (await RewardSession.findOne({ _id: firstReward.body.rewardSession.id })).status,
    "pending",
  );
});

test("rejects expired authentication, missing credentials, and invalid API input", {
  skip: databaseTestSkipReason,
}, async (t) => {
  const context = await createIntegrationContext({ databaseSuffix: "validation" });
  t.after(context.close);

  const account = await context.register("Validation Player");
  const expiredToken = jwt.sign({ sub: account.body.user.id }, integrationJwtSecret, {
    algorithm: "HS256",
    expiresIn: -1,
    issuer: "apple-worm-adventure",
    audience: "apple-worm-adventure-client",
  });
  const missingAuth = await context.request("/api/player/progress");
  const expiredAuth = await context.request("/api/player/progress", { token: expiredToken });
  const invalidLevel = await context.request("/api/player/sessions", {
    method: "POST",
    cookie: (await context.login(account.email, account.password)).cookie,
    body: { levelNumber: TOTAL_LEVELS + 1 },
  });
  const invalidBody = await context.request("/api/rewards/sessions", {
    method: "POST",
    cookie: (await context.login(account.email, account.password)).cookie,
    body: { rewardType: "bonus_coins", amount: 999999 },
  });
  const invalidId = await context.request("/api/player/sessions/not-an-object-id/actions", {
    method: "PUT",
    cookie: (await context.login(account.email, account.password)).cookie,
    body: { actions: [] },
  });

  assert.equal(missingAuth.response.status, 401);
  assert.equal(expiredAuth.response.status, 401);
  assert.equal(invalidLevel.response.status, 400);
  assert.equal(invalidBody.response.status, 400);
  assert.equal(invalidId.response.status, 400);
  assert.equal(typeof invalidLevel.body.error.message, "string");

  const expiredReward = await RewardSession.create({
    user: account.body.user.id,
    rewardType: "bonus_coins",
    amount: 25,
    status: "pending",
    provider: "development_simulation",
    expiresAt: new Date(Date.now() - 1000),
  });
  const expiredClaim = await context.request(
    `/api/rewards/sessions/${expiredReward._id}/verify`,
    {
      method: "POST",
      cookie: (await context.login(account.email, account.password)).cookie,
      body: {},
    },
  );
  assert.equal(expiredClaim.response.status, 410);
  assert.equal((await RewardSession.findById(expiredReward._id)).status, "expired");

  const foreignSession = await GameSession.findOne({ user: account.body.user.id });
  assert.equal(foreignSession, null);
});
