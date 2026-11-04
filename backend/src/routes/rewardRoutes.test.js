import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { createRewardRouter } from "./rewardRoutes.js";
import { createRewardProvider, RewardProviderAdapter } from "../services/rewardProviders.js";
import { createRewardService } from "../services/rewardService.js";
import { levels } from "../../../shared/levelData.js";
import { findHint, replayGameActions } from "../../../shared/gameLogic.js";

process.env.JWT_SECRET ??= "test_only_secret_that_is_not_used_in_production_12345";
const userIds = ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"];

function createHarness({
  bonusDailyLimit = 3,
  providerName = "development_simulation",
  minimumWatchSeconds = 5,
} = {}) {
  let now = new Date("2026-11-03T12:00:00.000Z");
  let nextId = 1;
  const configurations = [];
  const rewardSessions = [];
  const usages = [];
  const gameSessions = [];
  const coinTransactions = [];

  const RewardConfigurationModel = {
    async updateOne(filter, update) {
      if (!configurations.some((config) => config.rewardType === filter.rewardType)) {
        configurations.push({
          ...update.$setOnInsert,
          dailyLimit: update.$setOnInsert.rewardType === "bonus_coins"
            ? bonusDailyLimit
            : update.$setOnInsert.dailyLimit,
        });
      }
    },
    find() {
      const query = {
        sort() { return this; },
        then(resolve, reject) { return Promise.resolve(configurations).then(resolve, reject); },
      };
      return query;
    },
  };

  class RewardSessionDocument {
    constructor(values) {
      Object.assign(this, values);
      this._id = `${String(nextId++).padStart(24, "0")}`;
      this.createdAt = now;
      this.save = async () => this;
    }

    static async create(values) {
      if (
        values.referenceId &&
        rewardSessions.some((session) =>
          session.user === values.user &&
          session.rewardType === values.rewardType &&
          session.referenceId === values.referenceId)
      ) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }
      const document = new RewardSessionDocument(values);
      rewardSessions.push(document);
      return document;
    }

    static findOne(filter) {
      const query = {
        session() { return this; },
        then(resolve, reject) {
          const result = rewardSessions.find((session) =>
            (filter._id === undefined || session._id === String(filter._id)) &&
            session.user === String(filter.user) &&
            (filter.rewardType === undefined || session.rewardType === filter.rewardType) &&
            (filter.status === undefined || session.status === filter.status) &&
            (filter.expiresAt?.$gt === undefined || session.expiresAt > filter.expiresAt.$gt)) || null;
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    }

    static find(filter) {
      let offset = 0;
      let limit = Infinity;
      return {
        sort() { return this; },
        skip(count) { offset = count; return this; },
        limit(count) { limit = count; return this; },
        lean() {
          return Promise.resolve(rewardSessions
            .filter((session) => session.user === String(filter.user))
            .sort((first, second) => second.createdAt - first.createdAt)
            .slice(offset, offset + limit));
        },
      };
    }
  }

  class RewardUsageDocument {
    constructor(values) {
      Object.assign(this, values);
      this.save = async () => {
        const existingIndex = usages.findIndex((usage) =>
          usage.user === String(this.user) && usage.rewardType === this.rewardType);
        if (existingIndex < 0) usages.push(this);
        else usages[existingIndex] = this;
        return this;
      };
    }

    static findOne(filter) {
      return {
        session() { return this; },
        then(resolve, reject) {
          return Promise.resolve(usages.find((usage) =>
            usage.user === String(filter.user) &&
            usage.rewardType === filter.rewardType) || null).then(resolve, reject);
        },
      };
    }
  }

  const GameSessionModel = {
    findOne(filter) {
      return {
        session() { return this; },
        then(resolve, reject) {
          return Promise.resolve(gameSessions.find((session) =>
            session._id === String(filter._id) &&
            session.user === String(filter.user) &&
            session.status === filter.status) || null).then(resolve, reject);
        },
      };
    },
  };
  const UserModel = {
    findById(id) {
      const index = userIds.indexOf(String(id));
      return Promise.resolve(index < 0 ? null : {
        _id: userIds[index],
        displayName: `Player ${index + 1}`,
        email: `player${index + 1}@example.test`,
        role: "player",
        isActive: true,
      });
    },
  };
  const walletService = {
    async creditInTransaction(userId, transaction) {
      coinTransactions.push({ user: userId, ...transaction });
    },
  };
  const provider = createRewardProvider({
    providerName,
    minimumWatchSeconds,
    nodeEnvironment: "test",
  });
  const rewardService = createRewardService({
    RewardConfigurationModel,
    RewardSessionModel: RewardSessionDocument,
    RewardUsageModel: RewardUsageDocument,
    GameSessionModel,
    walletService,
    provider,
    now: () => now,
    startSession: async () => ({
      withTransaction: (operation) => operation(),
      endSession: async () => {},
    }),
  });

  const app = express();
  app.use(express.json());
  app.use("/api/rewards", createRewardRouter({
    UserModel,
    rewardService,
  }));
  app.use(errorHandler);
  const server = app.listen(0);

  return {
    configurations,
    rewardSessions,
    usages,
    gameSessions,
    coinTransactions,
    rewardService,
    setNow(value) { now = new Date(value); },
    start: () => once(server, "listening"),
    url: () => `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function tokenFor(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "apple-worm-adventure",
    audience: "apple-worm-adventure-client",
  });
}

async function request(context, path, {
  userId = userIds[0],
  anonymous = false,
  method = "GET",
  body,
} = {}) {
  const response = await fetch(`${context.url()}${path}`, {
    method,
    headers: {
      ...(!anonymous ? { Authorization: `Bearer ${tokenFor(userId)}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    response,
    body: await response.json().catch(() => ({})),
  };
}

async function startContext(options) {
  const context = createHarness(options);
  await context.start();
  return context;
}

async function beginBonusCoinReward(context) {
  return request(context, "/api/rewards/sessions", {
    method: "POST",
    body: { rewardType: "bonus_coins" },
  });
}

test("valid development verification grants the configured reward and coin ledger credit once", async (t) => {
  const context = await startContext();
  t.after(context.close);
  const started = await beginBonusCoinReward(context);
  assert.equal(started.response.status, 201);
  assert.equal(started.body.simulation.enabled, true);
  assert.match(started.body.simulation.label, /no real ad/i);

  const tooEarly = await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );
  assert.equal(tooEarly.response.status, 425);

  context.setNow("2026-11-03T12:00:06.000Z");
  const verified = await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );
  const duplicate = await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );

  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.rewardSession.status, "granted");
  assert.equal(verified.body.rewardSession.provider, "development_simulation");
  assert.equal(verified.body.simulation, true);
  assert.equal(duplicate.response.status, 409);
  assert.equal(context.coinTransactions.length, 1);
  assert.equal(context.coinTransactions[0].amount, 25);
  assert.equal(context.coinTransactions[0].source, "rewarded_ad");
});

test("supports all configured reward types only for matching game-session states", async (t) => {
  const context = await startContext({ minimumWatchSeconds: 1 });
  t.after(context.close);
  const gameReference = (id, status, levelNumber = 1) => {
    context.gameSessions.push({
      _id: id,
      user: userIds[0],
      status,
      levelNumber,
      actions: [],
    });
    return id;
  };
  const rewards = [
    ["revive", gameReference("111111111111111111111111", "failed")],
    ["double_score", gameReference("222222222222222222222222", "completed")],
    ["bonus_coins", undefined],
    ["extra_moves", gameReference("333333333333333333333333", "in_progress")],
    ["hint", gameReference("444444444444444444444444", "in_progress", 1)],
    ["booster", gameReference("555555555555555555555555", "in_progress")],
  ];

  const configuration = await request(context, "/api/rewards/configuration");
  assert.deepEqual(
    configuration.body.rewards.map((reward) => reward.rewardType).sort(),
    ["bonus_coins", "booster", "double_score", "extra_moves", "hint", "revive"],
  );
  assert.equal(configuration.body.rewards.find((reward) => reward.rewardType === "bonus_coins").enabled, true);
  assert.equal(configuration.body.rewards.find((reward) => reward.rewardType === "hint").enabled, true);
  for (const rewardType of ["revive", "double_score", "extra_moves", "booster"]) {
    assert.equal(configuration.body.rewards.find((reward) => reward.rewardType === rewardType).enabled, false);
    const unsupported = await request(context, "/api/rewards/sessions", {
      method: "POST",
      body: { rewardType, referenceId: rewards.find(([type]) => type === rewardType)[1] },
    });
    assert.equal(unsupported.response.status, 404, rewardType);
  }
  for (const [index, [rewardType, referenceId]] of rewards.entries()) {
    if (!["bonus_coins", "hint"].includes(rewardType)) continue;
    const started = await request(context, "/api/rewards/sessions", {
      method: "POST",
      body: { rewardType, ...(referenceId ? { referenceId } : {}) },
    });
    assert.equal(started.response.status, 201, rewardType);
    context.setNow(new Date(Date.parse("2026-11-03T12:00:00.000Z") + (index + 2) * 1000));
    const verified = await request(
      context,
      `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
      { method: "POST", body: {} },
    );
    assert.equal(verified.response.status, 200, rewardType);
    assert.equal(verified.body.rewardSession.rewardType, rewardType);
    if (rewardType === "hint") {
      const expectedDirection = findHint(replayGameActions(levels[0].board, []), levels[0].board);
      assert.deepEqual(verified.body.gameplayEffect, {
        type: "hint",
        direction: expectedDirection,
      });
    }
  }
  assert.equal(context.coinTransactions.length, 1);
});

test("rewarded hints are bound to an eligible active session and duplicate requests are rejected", async (t) => {
  const context = await startContext({ minimumWatchSeconds: 1 });
  t.after(context.close);
  const referenceId = "666666666666666666666666";
  context.gameSessions.push({
    _id: referenceId,
    user: userIds[0],
    status: "in_progress",
    levelNumber: 1,
    actions: [],
  });
  const started = await request(context, "/api/rewards/sessions", {
    method: "POST",
    body: { rewardType: "hint", referenceId },
  });
  const duplicate = await request(context, "/api/rewards/sessions", {
    method: "POST",
    body: { rewardType: "hint", referenceId },
  });
  assert.equal(started.response.status, 201);
  assert.equal(duplicate.response.status, 409);

  context.setNow("2026-11-03T12:00:02.000Z");
  const verified = await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );
  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.gameplayEffect.type, "hint");
  assert.equal(context.coinTransactions.length, 0);
});

test("enforces cooldown and per-day limits before creating new reward sessions", async (t) => {
  const context = await startContext({ bonusDailyLimit: 1 });
  t.after(context.close);
  const started = await beginBonusCoinReward(context);
  context.setNow("2026-11-03T12:00:06.000Z");
  const verified = await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );
  assert.equal(verified.response.status, 200);

  const dailyLimited = await beginBonusCoinReward(context);
  assert.equal(dailyLimited.response.status, 429);
  assert.match(dailyLimited.body.error.message, /daily limit/i);

  const cooldownContext = await startContext({ bonusDailyLimit: 3 });
  t.after(cooldownContext.close);
  const cooldownStarted = await beginBonusCoinReward(cooldownContext);
  cooldownContext.setNow("2026-11-03T12:00:06.000Z");
  await request(
    cooldownContext,
    `/api/rewards/sessions/${cooldownStarted.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );
  cooldownContext.setNow("2026-11-03T12:00:07.000Z");
  const cooldown = await beginBonusCoinReward(cooldownContext);
  assert.equal(cooldown.response.status, 429);
  assert.match(cooldown.body.error.message, /cooldown/i);
});

test("rejects foreign, missing, expired, and invalidly configured reward sessions", async (t) => {
  const context = await startContext();
  t.after(context.close);
  const started = await beginBonusCoinReward(context);
  const foreign = await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { userId: userIds[1], method: "POST", body: {} },
  );
  const missing = await request(
    context,
    "/api/rewards/sessions/cccccccccccccccccccccccc/verify",
    { method: "POST", body: {} },
  );
  const invalidType = await request(context, "/api/rewards/sessions", {
    method: "POST",
    body: { rewardType: "custom_coins", amount: 999999 },
  });
  assert.equal(foreign.response.status, 404);
  assert.equal(missing.response.status, 404);
  assert.equal(invalidType.response.status, 400);

  context.setNow("2026-11-03T12:06:00.000Z");
  const expired = await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );
  assert.equal(expired.response.status, 410);
});

test("rejects invalid related game sessions and returns player-scoped reward history", async (t) => {
  const context = await startContext();
  t.after(context.close);
  const invalidReference = await request(context, "/api/rewards/sessions", {
    method: "POST",
    body: {
      rewardType: "hint",
      referenceId: "dddddddddddddddddddddddd",
    },
  });
  assert.equal(invalidReference.response.status, 409);

  const started = await beginBonusCoinReward(context);
  context.setNow("2026-11-03T12:00:06.000Z");
  await request(
    context,
    `/api/rewards/sessions/${started.body.rewardSession.id}/verify`,
    { method: "POST", body: {} },
  );
  const ownHistory = await request(context, "/api/rewards/history");
  const otherHistory = await request(context, "/api/rewards/history", {
    userId: userIds[1],
  });
  const config = await request(context, "/api/rewards/configuration");

  assert.equal(ownHistory.body.rewards.length, 1);
  assert.equal(ownHistory.body.rewards[0].status, "granted");
  assert.equal(otherHistory.body.rewards.length, 0);
  assert.equal(config.body.provider, "development_simulation");
  assert.equal(config.body.simulated, true);
  assert.equal(config.body.rewards.find((reward) => reward.rewardType === "revive").enabled, false);
});

test("does not simulate in production and leaves rewards unavailable without a provider", async (t) => {
  const context = await startContext({ providerName: "unconfigured" });
  t.after(context.close);
  const config = await request(context, "/api/rewards/configuration");
  const start = await beginBonusCoinReward(context);
  assert.equal(config.body.provider, "unconfigured");
  assert.equal(config.body.simulated, false);
  assert.equal(config.body.rewards.find((reward) => reward.rewardType === "bonus_coins").enabled, false);
  assert.equal(start.response.status, 503);

  const provider = createRewardProvider({
    providerName: "development_simulation",
    nodeEnvironment: "production",
  });
  await assert.rejects(
    provider.verify({ createdAt: new Date(0) }, new Date(6000)),
    { statusCode: 503 },
  );
  assert.throws(
    () => createRewardProvider({
      providerName: "development_simulation",
      minimumWatchSeconds: Number.NaN,
      nodeEnvironment: "test",
    }),
    /must be an integer/,
  );
});

test("reward provider adapters expose a server verification contract", async () => {
  class TestProvider extends RewardProviderAdapter {
    async verify(rewardSession, now) {
      return {
        verified: rewardSession.provider === this.name,
        provider: this.name,
        verificationId: "provider-receipt",
        verifiedAt: now,
      };
    }
  }
  const adapter = new TestProvider({ name: "test-provider" });
  const provider = createRewardProvider({
    providerName: "test-provider",
    nodeEnvironment: "production",
    providerAdapters: { "test-provider": adapter },
  });
  const result = await provider.verify(
    { provider: "test-provider" },
    new Date("2026-11-03T12:00:00.000Z"),
  );
  assert.equal(provider, adapter);
  assert.equal(provider.isSimulation, false);
  assert.equal(result.verified, true);
  assert.equal(result.verificationId, "provider-receipt");
});

test("production never selects the development simulation reward provider", async () => {
  const provider = createRewardProvider({
    providerName: "development_simulation",
    nodeEnvironment: "production",
  });

  assert.equal(provider.name, "unconfigured");
  assert.equal(provider.isSimulation, false);
  await assert.rejects(
    provider.verify({}, new Date()),
    { statusCode: 503 },
  );
});
