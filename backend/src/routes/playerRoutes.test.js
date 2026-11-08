import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { createPlayerRouter } from "./playerRoutes.js";
import { levels, TOTAL_LEVELS } from "../../../shared/levelData.js";

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
  const wallets = new Map();
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

  const WalletModel = {
    async findOneAndUpdate(filter, update) {
      const wallet = wallets.get(String(filter.user));
      if (!wallet) return null;
      for (const [path, condition] of Object.entries(filter)) {
        if (!path.startsWith("boosterInventory.")) continue;
        const boosterId = path.slice("boosterInventory.".length);
        if ((wallet.boosterInventory[boosterId] || 0) < condition.$gte) return null;
      }
      for (const [path, amount] of Object.entries(update.$inc || {})) {
        const boosterId = path.slice("boosterInventory.".length);
        wallet.boosterInventory[boosterId] += amount;
      }
      return wallet;
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

  return {
    User,
    LevelProgress,
    GameSession,
    Achievement,
    WalletModel,
    progressRecords,
    sessions,
    achievements,
    wallets,
  };
}

async function createServer(levelDefinitions = levels) {
  const models = createModels();
  const startSession = async () => ({
    async withTransaction(operation) {
      await operation(this);
    },
    async endSession() {},
  });
  const app = express();
  app.use(express.json());
  app.use("/api/player", createPlayerRouter({
    UserModel: models.User,
    LevelProgressModel: models.LevelProgress,
    GameSessionModel: models.GameSession,
    WalletModel: models.WalletModel,
    AchievementModel: models.Achievement,
    levelDefinitions,
    startSession,
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

test("replays key collection and gate access on the server without client mechanic state", async (t) => {
  const mechanicLevel = {
    ...levels[0],
    board: {
      rows: 5,
      columns: 7,
      worm: [
        { row: 2, column: 0 },
        { row: 2, column: 1 },
      ],
      apples: [{ row: 2, column: 5 }],
      obstacles: [],
      portal: { row: 2, column: 6 },
      keys: [{ id: "bronze", row: 2, column: 2 }],
      gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 3 }],
    },
  };
  const context = await createServer([mechanicLevel, ...levels.slice(1)]);
  t.after(context.close);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(started.response.status, 201);

  const sessionActionsPath = `/api/player/sessions/${started.body.session.id}/actions`;
  const forgedState = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({
      actions: ["right"],
      collectedKeyIds: ["bronze"],
      positions: [{ row: 2, column: 6 }],
      gateStates: { "bronze-gate": "open" },
      status: "completed",
    }),
  });
  assert.equal(forgedState.response.status, 400);

  const saved = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["right", "right", "right", "right", "right"] }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.session.status, "completed");
  assert.equal(saved.body.session.moves, 5);
  assert.equal(saved.body.session.score, 100);
});

test("rejects locked-world sessions and ignores client-supplied unlock status", async (t) => {
  const context = await createServer();
  t.after(context.close);

  const forgedUnlock = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 26, unlockedWorld: true }),
  });
  assert.equal(forgedUnlock.response.status, 400);

  const lockedWorld = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 26 }),
  });
  assert.equal(lockedWorld.response.status, 403);
  assert.match(lockedWorld.body.error.message, /world is still locked/i);
  assert.equal(context.sessions.length, 0);
});

test("preserves progress and gates each world using completed-level records", async (t) => {
  const context = await createServer();
  t.after(context.close);

  const completeThrough = async (lastLevel) => {
    for (let levelNumber = 1; levelNumber <= lastLevel; levelNumber += 1) {
      const existing = context.progressRecords.find((row) =>
        row.user === userIds[0] && row.levelNumber === levelNumber);
      if (existing) {
        Object.assign(existing, {
          status: "completed",
          bestScore: levelNumber * 10,
          bestMoves: levelNumber,
          stars: 3,
          completedAt: new Date(),
        });
        continue;
      }
      context.progressRecords.push({
        user: userIds[0],
        levelNumber,
        status: "completed",
        bestScore: levelNumber * 10,
        bestMoves: levelNumber,
        stars: 3,
        completedAt: new Date(),
      });
    }
  };
  const startLevel = async (levelNumber) => request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber }),
  });

  const initiallyUnlocked = await request(context, "/api/player/progress");
  assert.equal(initiallyUnlocked.body.unlockedLevel, 1);
  assert.equal((await startLevel(1)).response.status, 201);

  await completeThrough(25);
  const forestComplete = await request(context, "/api/player/progress");
  assert.equal(forestComplete.body.unlockedLevel, 26);
  assert.equal(forestComplete.body.levels.length, 25);
  assert.equal((await startLevel(26)).response.status, 201);

  await completeThrough(50);
  const desertComplete = await request(context, "/api/player/progress");
  assert.equal(desertComplete.body.unlockedLevel, 51);
  assert.equal(desertComplete.body.levels.length, 50);
  assert.equal((await startLevel(51)).response.status, 201);

  await completeThrough(75);
  const iceComplete = await request(context, "/api/player/progress");
  assert.equal(iceComplete.body.unlockedLevel, 76);
  assert.equal(iceComplete.body.levels.length, 75);
  assert.equal((await startLevel(76)).response.status, 201);

  await completeThrough(100);
  const allWorldsComplete = await request(context, "/api/player/progress");
  assert.equal(allWorldsComplete.body.unlockedLevel, 100);
  assert.equal(allWorldsComplete.body.levels.length, 100);
  assert.ok(allWorldsComplete.body.levels.every(
    (record) => record.status === "completed",
  ));
  assert.equal((await startLevel(100)).response.status, 201);
});

test("validates booster activations, consumes only owned inventory, and protects player sessions", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const start = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(start.response.status, 201);
  const sessionId = start.body.session.id;
  const actionsPath = `/api/player/sessions/${sessionId}/actions`;

  const unavailable = await request(context, actionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["booster:undo"] }),
  });
  assert.equal(unavailable.response.status, 400);
  assert.equal(context.sessions[0].actions.length, 0);

  context.wallets.set(userIds[0], {
    boosterInventory: {
      undo: 1,
      shield: 0,
      extra_moves: 0,
      hint: 0,
      freeze: 0,
    },
  });
  const used = await request(context, actionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["right", "booster:undo"] }),
  });
  assert.equal(used.response.status, 200);
  assert.equal(used.body.session.moves, 0);
  assert.deepEqual(used.body.session.actions, ["right", "booster:undo"]);
  assert.equal(context.wallets.get(userIds[0]).boosterInventory.undo, 0);

  const replay = await request(context, actionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["right", "booster:undo"] }),
  });
  assert.equal(replay.response.status, 200);
  assert.equal(context.wallets.get(userIds[0]).boosterInventory.undo, 0);

  const otherPlayer = await request(context, actionsPath, {
    userId: userIds[1],
    method: "PUT",
    body: JSON.stringify({ actions: ["right"] }),
  });
  assert.equal(otherPlayer.response.status, 404);

  context.wallets.get(userIds[0]).boosterInventory.shield = 1;
  for (const status of ["completed", "failed"]) {
    context.sessions[0].status = status;
    const terminalActivation = await request(context, actionsPath, {
      method: "PUT",
      body: JSON.stringify({ actions: ["right", "booster:undo", "booster:shield"] }),
    });
    assert.equal(terminalActivation.response.status, 409);
    assert.equal(context.wallets.get(userIds[0]).boosterInventory.shield, 1);
  }
});

test("replays teleport actions deterministically on the server", async (t) => {
  const teleportLevel = {
    ...levels[0],
    board: {
      rows: 5,
      columns: 7,
      worm: [
        { row: 3, column: 0 },
        { row: 3, column: 1 },
      ],
      apples: [{ row: 2, column: 5 }],
      obstacles: [],
      portal: { row: 3, column: 5 },
      teleports: [{
        id: "portal-pair-1",
        entry: { row: 3, column: 2 },
        exit: { row: 1, column: 5 },
      }],
    },
  };
  const context = await createServer([teleportLevel, ...levels.slice(1)]);
  t.after(context.close);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(started.response.status, 201);

  const sessionActionsPath = `/api/player/sessions/${started.body.session.id}/actions`;
  const forgedState = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({
      actions: ["right"],
      teleportDestination: { row: 1, column: 5 },
      teleportStatus: "used",
    }),
  });
  assert.equal(forgedState.response.status, 400);

  const actions = ["right", "down", "down"];
  const firstSave = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions }),
  });
  const duplicateSave = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions }),
  });
  assert.equal(firstSave.response.status, 200);
  assert.equal(firstSave.body.session.status, "completed");
  assert.equal(firstSave.body.session.moves, 3);
  assert.equal(firstSave.body.session.score, 100);
  assert.deepEqual(
    {
      status: duplicateSave.body.session.status,
      moves: duplicateSave.body.session.moves,
      score: duplicateSave.body.session.score,
      actions: duplicateSave.body.session.actions,
    },
    {
      status: firstSave.body.session.status,
      moves: firstSave.body.session.moves,
      score: firstSave.body.session.score,
      actions: firstSave.body.session.actions,
    },
  );
});

test("replays moving obstacle positions on the server without client-supplied state", async (t) => {
  const movingObstacleLevel = {
    ...levels[0],
    board: {
      rows: 5,
      columns: 7,
      worm: [
        { row: 2, column: 0 },
        { row: 2, column: 1 },
      ],
      apples: [{ row: 4, column: 5 }],
      obstacles: [],
      portal: { row: 4, column: 6 },
      movingObstacles: [{
        id: "patroller",
        path: [{ row: 0, column: 0 }, { row: 2, column: 2 }],
      }],
    },
  };
  const context = await createServer([movingObstacleLevel, ...levels.slice(1)]);
  t.after(context.close);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(started.response.status, 201);

  const sessionActionsPath = `/api/player/sessions/${started.body.session.id}/actions`;
  const forgedState = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({
      actions: ["right"],
      movingObstaclePositions: [{ row: 2, column: 1 }],
      status: "completed",
    }),
  });
  assert.equal(forgedState.response.status, 400);

  const firstSave = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["right"] }),
  });
  const duplicateSave = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["right"] }),
  });
  assert.equal(firstSave.response.status, 200);
  assert.equal(firstSave.body.session.status, "failed");
  assert.equal(firstSave.body.session.moves, 1);
  assert.deepEqual(
    {
      status: duplicateSave.body.session.status,
      moves: duplicateSave.body.session.moves,
      actions: duplicateSave.body.session.actions,
    },
    {
      status: firstSave.body.session.status,
      moves: firstSave.body.session.moves,
      actions: firstSave.body.session.actions,
    },
  );
});

test("replays ice sliding on the server from direction-only actions", async (t) => {
  const iceLevel = {
    ...levels[0],
    board: {
      rows: 5,
      columns: 7,
      worm: [{ row: 2, column: 0 }, { row: 2, column: 1 }],
      apples: [{ row: 2, column: 5 }],
      obstacles: [],
      portal: { row: 2, column: 6 },
      iceTiles: [
        { row: 2, column: 2 },
        { row: 2, column: 3 },
        { row: 2, column: 4 },
      ],
    },
  };
  const context = await createServer([iceLevel, ...levels.slice(1)]);
  t.after(context.close);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(started.response.status, 201);

  const sessionActionsPath = `/api/player/sessions/${started.body.session.id}/actions`;
  const forgedState = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({
      actions: ["right"],
      iceSlideSteps: 4,
      positions: [{ row: 2, column: 5 }],
      status: "completed",
    }),
  });
  assert.equal(forgedState.response.status, 400);

  const actions = ["right", "right"];
  const firstSave = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions }),
  });
  const duplicateSave = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions }),
  });
  assert.equal(firstSave.response.status, 200);
  assert.equal(firstSave.body.session.status, "completed");
  assert.equal(firstSave.body.session.moves, 2);
  assert.equal(firstSave.body.session.score, 100);
  assert.deepEqual(
    {
      status: duplicateSave.body.session.status,
      moves: duplicateSave.body.session.moves,
      score: duplicateSave.body.session.score,
      actions: duplicateSave.body.session.actions,
    },
    {
      status: firstSave.body.session.status,
      moves: firstSave.body.session.moves,
      score: firstSave.body.session.score,
      actions: firstSave.body.session.actions,
    },
  );
});

test("enforces a level move limit during authoritative server replay", async (t) => {
  const challengeLevel = {
    ...levels[0],
    moveLimit: 2,
    board: {
      rows: 5,
      columns: 6,
      worm: [{ row: 2, column: 0 }, { row: 2, column: 1 }],
      apples: [{ row: 2, column: 3 }],
      obstacles: [],
      portal: { row: 2, column: 4 },
    },
  };
  const context = await createServer([challengeLevel, ...levels.slice(1)]);
  t.after(context.close);
  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(started.response.status, 201);

  const sessionActionsPath = `/api/player/sessions/${started.body.session.id}/actions`;
  const forgedState = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({
      actions: ["right"],
      score: 100,
      status: "completed",
    }),
  });
  assert.equal(forgedState.response.status, 400);

  const failed = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["right", "right"] }),
  });
  assert.equal(failed.response.status, 200);
  assert.equal(failed.body.session.status, "failed");
  assert.equal(failed.body.session.moves, 2);
  assert.equal(failed.body.session.score, 100);

  const additionalMove = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions: ["right", "right", "right"] }),
  });
  assert.equal(additionalMove.response.status, 409);
});

test("starts and saves levels 51 and 100 while rejecting level 101", async (t) => {
  const context = await createServer();
  t.after(context.close);
  for (let levelNumber = 1; levelNumber < TOTAL_LEVELS; levelNumber += 1) {
    const progress = {
      user: userIds[0],
      levelNumber,
      status: "completed",
      bestScore: 100,
      bestMoves: 1,
      stars: 3,
      completedAt: new Date(),
    };
    progress.save = async () => progress;
    context.progressRecords.push(progress);
  }

  for (const levelNumber of [51, TOTAL_LEVELS]) {
    const started = await request(context, "/api/player/sessions", {
      method: "POST",
      body: JSON.stringify({ levelNumber }),
    });
    assert.equal(started.response.status, 201);
    assert.equal(started.body.session.levelNumber, levelNumber);

    const saved = await request(
      context,
      `/api/player/sessions/${started.body.session.id}/actions`,
      {
        method: "PUT",
        body: JSON.stringify({ actions: routeActions(levels[levelNumber - 1]) }),
      },
    );
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.session.status, "completed");
    assert.equal(saved.body.session.levelNumber, levelNumber);
  }

  const beyondMaximum = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: TOTAL_LEVELS + 1 }),
  });
  assert.equal(beyondMaximum.response.status, 400);
});

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

test("retries completed-session progress finalization after a progress save failure", async (t) => {
  const context = await createServer();
  t.after(context.close);
  context.wallets.set(userIds[0], {
    balance: 37,
    boosterInventory: {
      undo: 0,
      shield: 1,
      extra_moves: 0,
      hint: 0,
      freeze: 0,
    },
  });

  const started = await request(context, "/api/player/sessions", {
    method: "POST",
    body: JSON.stringify({ levelNumber: 1 }),
  });
  assert.equal(started.response.status, 201);

  const levelProgress = context.progressRecords.find((record) =>
    record.user === userIds[0] && record.levelNumber === 1);
  let completionSaveAttempts = 0;
  levelProgress.save = async () => {
    if (levelProgress.status === "completed" && completionSaveAttempts === 0) {
      completionSaveAttempts += 1;
      Object.assign(levelProgress, {
        status: "unlocked",
        bestScore: 0,
        bestMoves: undefined,
        stars: 0,
        completedAt: null,
      });
      throw new Error("Injected LevelProgress save failure.");
    }
    if (levelProgress.status === "completed") completionSaveAttempts += 1;
    return levelProgress;
  };

  const actions = ["booster:shield", ...routeActions(levels[0])];
  const sessionActionsPath = `/api/player/sessions/${started.body.session.id}/actions`;
  const firstAttempt = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions }),
  });
  assert.equal(firstAttempt.response.status, 500);
  assert.equal(context.sessions[0].status, "completed");
  assert.equal(levelProgress.status, "unlocked");
  assert.equal(completionSaveAttempts, 1);
  assert.equal(context.wallets.get(userIds[0]).boosterInventory.shield, 0);
  assert.equal(context.wallets.get(userIds[0]).balance, 37);

  const retry = await request(context, sessionActionsPath, {
    method: "PUT",
    body: JSON.stringify({ actions }),
  });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.session.status, "completed");
  assert.equal(retry.body.progress.unlockedLevel, 2);
  assert.equal(levelProgress.status, "completed");
  assert.equal(levelProgress.bestScore, 100);
  assert.equal(levelProgress.bestMoves, levels[0].parMoves);
  assert.equal(context.progressRecords.find((record) => record.levelNumber === 2).status, "unlocked");
  assert.equal(completionSaveAttempts, 2);
  assert.equal(context.achievements.length, 12);
  assert.equal(context.achievements.find((item) => item.key === "first-level").progress, 1);
  assert.ok(context.achievements.find((item) => item.key === "first-level").unlockedAt);
  assert.equal(context.wallets.get(userIds[0]).boosterInventory.shield, 0);
  assert.equal(context.wallets.get(userIds[0]).balance, 37);
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
