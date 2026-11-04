import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { createPlayerRouter } from "./playerRoutes.js";
import { levels } from "../../../shared/levelData.js";

process.env.JWT_SECRET ??= "test_only_secret_that_is_not_used_in_production_12345";
const userIds = ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"];

function makeQuery(getValue) {
  let maxItems = Infinity;
  return {
    sort() {
      return this;
    },
    limit(count) {
      maxItems = count;
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(getValue())
        .then((value) => Array.isArray(value) ? value.slice(0, maxItems) : value)
        .then(resolve, reject);
    },
  };
}

function createModels() {
  const users = userIds.map((id, index) => ({
    _id: id,
    displayName: `Player ${index + 1}`,
    email: `player${index + 1}@example.test`,
    role: "player",
    avatar: "",
    isActive: true,
  }));
  const progressRecords = [];
  const sessions = [];
  const achievements = [];
  let nextSession = 1;

  const User = {
    collection: { name: "users" },
    findById(id) {
      return Promise.resolve(users.find((user) => user._id === String(id)) || null);
    },
  };

  const LevelProgress = {
    find(filter) {
      return makeQuery(() => progressRecords.filter((row) =>
        row.user === String(filter.user)));
    },
    findOne(filter) {
      return makeQuery(() => progressRecords.find((row) =>
        row.user === String(filter.user) &&
        row.levelNumber === filter.levelNumber) || null);
    },
    async create(values) {
      const progress = {
        ...values,
        bestScore: 0,
        stars: 0,
        completedAt: null,
        save: async () => progress,
      };
      progressRecords.push(progress);
      return progress;
    },
    async aggregate() {
      const totals = new Map();
      for (const progress of progressRecords.filter((row) => row.status === "completed")) {
        const total = totals.get(progress.user) || { score: 0, completedLevels: 0 };
        total.score += progress.bestScore;
        total.completedLevels += 1;
        totals.set(progress.user, total);
      }
      return [...totals.entries()]
        .map(([userId, total]) => {
          const user = users.find((row) => row._id === userId);
          return {
            id: userId,
            name: user.displayName,
            avatar: user.avatar,
            ...total,
          };
        })
        .sort((first, second) => second.score - first.score || first.id.localeCompare(second.id))
        .slice(0, 50);
    },
  };

  const GameSession = {
    find(filter) {
      return makeQuery(() => sessions.filter((row) =>
        row.user === String(filter.user)));
    },
    findOne(filter) {
      return makeQuery(() => sessions.find((row) =>
        (filter._id === undefined || row._id === String(filter._id)) &&
        row.user === String(filter.user) &&
        (filter.status === undefined || row.status === filter.status)) || null);
    },
    async updateMany(filter, update) {
      for (const session of sessions) {
        if (session.user === String(filter.user) && session.status === filter.status) {
          Object.assign(session, update.$set);
        }
      }
    },
    async create(values) {
      const session = {
        ...values,
        _id: `${String(nextSession++).padStart(24, "0")}`,
        startedAt: new Date(),
        endedAt: null,
        score: 0,
        moves: 0,
        applesCollected: 0,
        stars: 0,
        save: async () => session,
      };
      sessions.push(session);
      return session;
    },
    async findOneAndUpdate(filter, update) {
      const session = sessions.find((row) =>
        row._id === String(filter._id) &&
        row.user === String(filter.user) &&
        row.status === filter.status &&
        JSON.stringify(row.actions) === JSON.stringify(filter.actions));
      if (!session) return null;
      Object.assign(session, update.$set);
      return session;
    },
    async aggregate(pipeline) {
      const userId = String(pipeline[0].$match.user);
      return [{
        _id: null,
        totalMoves: sessions
          .filter((session) => session.user === userId)
          .reduce((total, session) => total + session.moves, 0),
      }];
    },
  };

  const Achievement = {
    find(filter) {
      return makeQuery(() => achievements.filter((row) =>
        row.user === String(filter.user)));
    },
    async create(values) {
      const achievement = {
        ...values,
        _id: `${String(achievements.length + 1).padStart(24, "0")}`,
        save: async () => achievement,
      };
      achievements.push(achievement);
      return achievement;
    },
  };

  return { User, LevelProgress, GameSession, Achievement, progressRecords, sessions, achievements };
}

async function createServer() {
  const models = createModels();
  const app = express();
  app.use(express.json());
  app.use("/api/player", createPlayerRouter({
    UserModel: models.User,
    LevelProgressModel: models.LevelProgress,
    GameSessionModel: models.GameSession,
    AchievementModel: models.Achievement,
  }));
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  return {
    ...models,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function authToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "apple-worm-adventure",
    audience: "apple-worm-adventure-client",
  });
}

async function request(context, path, { userId = userIds[0], anonymous = false, ...options } = {}) {
  const response = await fetch(`${context.url}${path}`, {
    ...options,
    headers: {
      ...(!anonymous ? { Authorization: `Bearer ${authToken(userId)}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  return { response, body: await response.json() };
}

function routeActions(level) {
  const route = [];
  for (let row = 0; row < level.board.rows; row += 2) {
    const forward = route.length === 0 || route.at(-1).column === 0;
    const columns = forward
      ? Array.from({ length: level.board.columns }, (_, column) => column)
      : Array.from({ length: level.board.columns }, (_, column) => level.board.columns - column - 1);
    for (const column of columns) route.push({ row, column });
    if (row + 1 < level.board.rows) {
      route.push({ row: row + 1, column: route.at(-1).column });
    }
  }
  const directions = [];
  for (let index = level.board.worm.length; index < route.length; index += 1) {
    const previous = route[index - 1];
    const next = route[index];
    directions.push(
      next.row < previous.row ? "up" :
        next.row > previous.row ? "down" :
          next.column < previous.column ? "left" : "right",
    );
  }
  return directions;
}

test("saves and replays player actions once, validates completion, and unlocks the next level", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(started.response.status, 201);

  const actions = routeActions(levels[0]);
  const sessionActionsPath = `/api/player/sessions/${started.body.session.id}/actions`;
  const duplicateSaves = await Promise.all([
    request(context, sessionActionsPath, { method: "PUT", body: JSON.stringify({ actions }) }),
    request(context, sessionActionsPath, { method: "PUT", body: JSON.stringify({ actions }) }),
  ]);
  const saved = duplicateSaves[0];
  assert.deepEqual(duplicateSaves.map(({ response }) => response.status), [200, 200]);
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.session.status, "completed");
  assert.equal(saved.body.session.score, levels[0].board.apples.length * 100);
  assert.equal(saved.body.session.moves, levels[0].parMoves);
  assert.equal(saved.body.session.stars, 3);
  assert.equal(saved.body.progress.unlockedLevel, 2);
  assert.equal(context.achievements.length, 12);
  assert.equal(context.achievements.find((item) => item.key === "first-level").progress, 1);
  assert.ok(context.achievements.find((item) => item.key === "first-level").unlockedAt);

  assert.equal(context.achievements.length, 12);

  const progress = await request(context, "/api/player/progress");
  assert.deepEqual(
    progress.body.levels.map(({ levelNumber, status, bestScore, bestMoves, stars }) => ({
      levelNumber, status, bestScore, bestMoves, stars,
    })),
    [
      { levelNumber: 1, status: "completed", bestScore: 100, bestMoves: levels[0].parMoves, stars: 3 },
      { levelNumber: 2, status: "unlocked", bestScore: 0, bestMoves: null, stars: 0 },
    ],
  );
});

test("returns only the caller's history and prevents access to another player's session", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  const saved = await request(
    context,
    `/api/player/sessions/${started.body.session.id}/actions`,
    { method: "PUT", body: JSON.stringify({ actions: ["right"] }) },
  );
  assert.equal(saved.response.status, 200);

  const ownHistory = await request(context, "/api/player/history");
  const otherHistory = await request(context, "/api/player/history", { userId: userIds[1] });
  const stolenSession = await request(
    context,
    `/api/player/sessions/${started.body.session.id}/actions`,
    { userId: userIds[1], method: "PUT", body: JSON.stringify({ actions: [] }) },
  );

  assert.equal(ownHistory.body.history.length, 1);
  assert.equal(ownHistory.body.history[0].status, "in_progress");
  assert.equal(otherHistory.body.history.length, 0);
  assert.equal(stolenSession.response.status, 404);
  const staleSave = await request(
    context,
    `/api/player/sessions/${started.body.session.id}/actions`,
    { method: "PUT", body: JSON.stringify({ actions: [] }) },
  );
  assert.equal(staleSave.response.status, 200);
  assert.equal(staleSave.body.session.moves, 1);
  assert.deepEqual(staleSave.body.session.actions, ["right"]);
});

test("rejects locked levels and client-forged results or invalid move sequences", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const locked = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 2 }),
  });
  assert.equal(locked.response.status, 403);

  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  const forged = await request(
    context,
    `/api/player/sessions/${started.body.session.id}/actions`,
    {
      method: "PUT",
      body: JSON.stringify({ actions: ["up"], score: 10000, stars: 3 }),
    },
  );
  assert.equal(forged.response.status, 400);
});

test("dashboard sums moves across attempts and leaderboard uses completed best scores", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const firstAttempt = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  const failedAttempt = await request(
    context,
    `/api/player/sessions/${firstAttempt.body.session.id}/actions`,
    { method: "PUT", body: JSON.stringify({ actions: ["right", "right", "down"] }) },
  );
  assert.equal(failedAttempt.response.status, 200);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  await request(context, `/api/player/sessions/${started.body.session.id}/actions`, {
    method: "PUT",
    body: JSON.stringify({ actions: routeActions(levels[0]) }),
  });

  const dashboard = await request(context, "/api/player/dashboard");
  const leaderboard = await request(context, "/api/player/leaderboard", {
    anonymous: true,
  });
  const anonymousDashboard = await request(context, "/api/player/dashboard", {
    anonymous: true,
  });

  assert.equal(dashboard.body.stats.completedLevels, 1);
  assert.equal(dashboard.body.stats.totalScore, 100);
  assert.equal(dashboard.body.stats.totalMoves, 3 + levels[0].parMoves);
  assert.equal(dashboard.body.resume.levelNumber, 2);
  assert.equal(leaderboard.response.status, 200);
  assert.equal(leaderboard.body.players[0].score, 100);
  assert.equal(leaderboard.body.players[0].completedLevels, 1);
  assert.equal(anonymousDashboard.response.status, 401);
});
