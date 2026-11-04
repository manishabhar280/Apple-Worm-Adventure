import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { levels } from "../../../shared/levelData.js";
import {
  createIntegrationContext,
  databaseTestSkipReason,
  routeActions,
  waitForSimulation,
} from "./mongoTestSupport.js";

test("persists a registered player's game, wallet, and rewards across backend restart", {
  skip: databaseTestSkipReason,
}, async (t) => {
  const context = await createIntegrationContext({ databaseSuffix: "journey" });
  t.after(context.close);

  const registered = await context.register("Journey Player");
  const authenticated = await context.login(registered.email, registered.password);
  const cookie = authenticated.cookie;
  const profile = await context.request("/api/auth/me", { cookie });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.user.id, registered.body.user.id);

  const anonymousDashboard = await context.request("/api/player/dashboard");
  assert.equal(anonymousDashboard.response.status, 401);
  const dashboard = await context.request("/api/player/dashboard", { cookie });
  assert.equal(dashboard.response.status, 200);

  const started = await context.request("/api/player/sessions", {
    method: "POST",
    cookie,
    body: { levelNumber: 1 },
  });
  assert.equal(started.response.status, 201);
  const sessionId = started.body.session.id;
  const actions = routeActions(levels[0]);
  const partial = await context.request(`/api/player/sessions/${sessionId}/actions`, {
    method: "PUT",
    cookie,
    body: { actions: actions.slice(0, 1) },
  });
  assert.equal(partial.response.status, 200);

  await context.restartBackend();
  const restored = await context.request("/api/player/progress", { cookie });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.activeSession.id, sessionId);
  assert.deepEqual(restored.body.activeSession.actions, actions.slice(0, 1));

  const duplicateReward = await context.request("/api/rewards/sessions", {
    method: "POST",
    cookie,
    body: { rewardType: "hint", referenceId: sessionId },
  });
  const hintReward = await context.request("/api/rewards/sessions", {
    method: "POST",
    cookie,
    body: { rewardType: "hint", referenceId: sessionId },
  });
  assert.equal(duplicateReward.response.status, 201);
  assert.equal(hintReward.response.status, 409);
  await waitForSimulation();
  const verifiedHint = await context.request(
    `/api/rewards/sessions/${duplicateReward.body.rewardSession.id}/verify`,
    { method: "POST", cookie, body: {} },
  );
  assert.equal(verifiedHint.response.status, 200);
  assert.equal(verifiedHint.body.rewardSession.status, "granted");
  assert.equal(verifiedHint.body.gameplayEffect.type, "hint");

  const reward = await context.request("/api/rewards/sessions", {
    method: "POST",
    cookie,
    body: { rewardType: "bonus_coins" },
  });
  assert.equal(reward.response.status, 201);
  await waitForSimulation();
  const granted = await context.request(
    `/api/rewards/sessions/${reward.body.rewardSession.id}/verify`,
    { method: "POST", cookie, body: {} },
  );
  assert.equal(granted.response.status, 200);

  const balanceBeforeHint = await context.request("/api/wallet/balance", { cookie });
  assert.equal(balanceBeforeHint.body.balance, 25);
  const requestId = randomUUID();
  const purchase = await context.request("/api/wallet/hints", {
    method: "POST",
    cookie,
    body: { requestId },
  });
  const duplicatePurchase = await context.request("/api/wallet/hints", {
    method: "POST",
    cookie,
    body: { requestId },
  });
  assert.equal(purchase.response.status, 200);
  assert.equal(purchase.body.balance, 20);
  assert.equal(purchase.body.duplicate, false);
  assert.equal(duplicatePurchase.body.balance, 20);
  assert.equal(duplicatePurchase.body.duplicate, true);

  const completed = await context.request(`/api/player/sessions/${sessionId}/actions`, {
    method: "PUT",
    cookie,
    body: { actions },
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.session.status, "completed");
  assert.equal(completed.body.session.score, levels[0].board.apples.length * 100);
  assert.equal(completed.body.session.moves, levels[0].parMoves);
  assert.equal(completed.body.session.stars, 3);
  assert.equal(completed.body.progress.unlockedLevel, 2);

  const savedProgress = await context.request("/api/player/progress", { cookie });
  const savedDashboard = await context.request("/api/player/dashboard", { cookie });
  const leaderboard = await context.request("/api/player/leaderboard");
  const wallet = await context.request("/api/wallet/balance", { cookie });
  const transactions = await context.request("/api/wallet/transactions", { cookie });
  const history = await context.request("/api/rewards/history", { cookie });

  assert.equal(savedProgress.body.levels.find((row) => row.levelNumber === 1).stars, 3);
  assert.equal(savedDashboard.body.stats.completedLevels, 1);
  assert.equal(savedDashboard.body.stats.totalScore, completed.body.session.score);
  assert.equal(savedDashboard.body.stats.totalMoves, levels[0].parMoves);
  assert.equal(
    leaderboard.body.players.find((row) => row.id === registered.body.user.id).score,
    completed.body.session.score,
  );
  assert.equal(wallet.body.balance, 20);
  assert.equal(transactions.body.transactions.length, 2);
  assert.equal(transactions.body.transactions.filter((row) => row.source === "gameplay").length, 1);
  assert.equal(history.body.rewards.filter((row) => row.status === "granted").length, 2);
});
