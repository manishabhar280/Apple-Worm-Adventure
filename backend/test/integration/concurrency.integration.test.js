import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { levels } from "../../../shared/levelData.js";
import RewardSession from "../../src/models/RewardSession.js";
import RewardUsage from "../../src/models/RewardUsage.js";
import Wallet from "../../src/models/Wallet.js";
import WalletTransaction from "../../src/models/WalletTransaction.js";
import {
  createIntegrationContext,
  databaseTestSkipReason,
  routeActions,
  waitForSimulation,
} from "./mongoTestSupport.js";

test("serializes concurrent wallet debits and duplicate reward claims", {
  skip: databaseTestSkipReason,
}, async (t) => {
  const context = await createIntegrationContext({ databaseSuffix: "concurrency" });
  t.after(context.close);

  const account = await context.register("Concurrent Player");
  const cookie = (await context.login(account.email, account.password)).cookie;
  const wallet = await Wallet.create({
    user: account.body.user.id,
    balance: 10,
    currency: "COIN",
  });
  await WalletTransaction.create({
    wallet: wallet._id,
    user: account.body.user.id,
    type: "credit",
    amount: 10,
    source: "adjustment",
    reason: "Concurrency test fixture",
  });

  const game = await context.request("/api/player/sessions", {
    method: "POST",
    cookie,
    body: { levelNumber: 1 },
  });
  assert.equal(game.response.status, 201);
  const sessionId = game.body.session.id;
  const actions = routeActions(levels[0]);
  const partial = await context.request(`/api/player/sessions/${sessionId}/actions`, {
    method: "PUT",
    cookie,
    body: { actions: actions.slice(0, 1) },
  });
  assert.equal(partial.response.status, 200);

  const purchases = await Promise.all(Array.from({ length: 8 }, () =>
    context.request("/api/wallet/hints", {
      method: "POST",
      cookie,
      body: { requestId: randomUUID() },
    })));
  assert.equal(purchases.filter((item) => item.response.status === 200).length, 2);
  assert.equal(purchases.filter((item) => item.response.status === 409).length, 6);
  assert.equal((await Wallet.findOne({ user: account.body.user.id })).balance, 0);
  assert.equal((await WalletTransaction.find({ user: account.body.user.id })).length, 3);

  const referenceId = sessionId;
  const duplicateSaves = await Promise.all([1, 2].map(() =>
    context.request(`/api/player/sessions/${referenceId}/actions`, {
      method: "PUT",
      cookie,
      body: { actions: ["right"] },
    })));
  assert.deepEqual(
    duplicateSaves.map((item) => item.response.status),
    [200, 200],
  );
  assert.equal((await context.request("/api/player/history", { cookie })).body.history.length, 1);
  await context.request("/api/rewards/configuration", { cookie });
  const rewardRequests = await Promise.all([1, 2].map(() =>
    context.request("/api/rewards/sessions", {
      method: "POST",
      cookie,
      body: { rewardType: "hint", referenceId },
    })));
  assert.deepEqual(
    rewardRequests.map((item) => item.response.status).sort(),
    [201, 409],
  );

  const startedReward = rewardRequests.find((item) => item.response.status === 201);
  await waitForSimulation();
  const claims = await Promise.all([1, 2].map(() =>
    context.request(
      `/api/rewards/sessions/${startedReward.body.rewardSession.id}/verify`,
      { method: "POST", cookie, body: {} },
    )));
  assert.deepEqual(
    claims.map((item) => item.response.status).sort(),
    [200, 409],
  );
  assert.equal((await RewardUsage.findOne({
    user: account.body.user.id,
    rewardType: "hint",
  })).dailyCount, 1);
  assert.equal((await RewardSession.find({
    user: account.body.user.id,
    rewardType: "hint",
    referenceId,
  })).length, 1);
  assert.equal((await Wallet.findOne({ user: account.body.user.id })).balance, 0);
});
