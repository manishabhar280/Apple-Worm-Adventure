import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { createWalletRouter } from "./walletRoutes.js";
import { createWalletService } from "../services/walletService.js";
import { BOOSTER_CATALOG } from "../../../shared/boosterCatalog.js";
import { levels } from "../../../shared/levelData.js";

process.env.JWT_SECRET ??= "test_only_secret_that_is_not_used_in_production_12345";
const playerIds = ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"];

function createWalletHarness({ levelDefinitions = levels } = {}) {
  const wallets = new Map();
  const transactions = [];
  const gameSessions = [];
  let nextId = 1;
  let transactionTail = Promise.resolve();
  const WalletModel = {
    async findOneAndUpdate(filter, update, options = {}) {
      let wallet = wallets.get(String(filter.user));
      if (update.$setOnInsert) {
        if (!wallet && options.upsert) {
          wallet = {
            _id: `${String(nextId++).padStart(24, "0")}`,
            ...update.$setOnInsert,
            boosterInventory: {
              undo: 0,
              shield: 0,
              extra_moves: 0,
              hint: 0,
              freeze: 0,
            },
          };
          wallets.set(String(filter.user), wallet);
        }
        return wallet || null;
      }

      if (
        !wallet ||
        (filter._id !== undefined && String(wallet._id) !== String(filter._id)) ||
        (filter.balance?.$gte !== undefined && wallet.balance < filter.balance.$gte) ||
        (filter.balance?.$lte !== undefined && wallet.balance > filter.balance.$lte) ||
        Object.entries(filter)
          .filter(([path]) => path.startsWith("boosterInventory."))
          .some(([path, condition]) =>
            wallet.boosterInventory[path.slice("boosterInventory.".length)] <
            condition.$gte)
      ) {
        return null;
      }
      for (const [path, amount] of Object.entries(update.$inc || {})) {
        if (path === "balance") {
          wallet.balance += amount;
        } else if (path.startsWith("boosterInventory.")) {
          const boosterId = path.slice("boosterInventory.".length);
          wallet.boosterInventory[boosterId] += amount;
        }
      }
      return wallet;
    },
    findOne(filter) {
      return Promise.resolve(wallets.get(String(filter.user)) || null);
    },
  };

  const WalletTransactionModel = {
    async create(docs) {
      if (docs.some((doc) =>
        doc.source === "gameplay" &&
        transactions.some((entry) =>
          entry.user === doc.user &&
          entry.source === doc.source &&
          entry.referenceId === doc.referenceId))) {
        const error = new Error("Duplicate gameplay transaction.");
        error.code = 11000;
        throw error;
      }
      const created = docs.map((doc) => ({
        ...doc,
        _id: `${String(nextId++).padStart(24, "0")}`,
        createdAt: new Date(),
      }));
      transactions.push(...created);
      return created;
    },
    findOne(filter) {
      return Promise.resolve(transactions.find((entry) =>
        String(entry.user) === String(filter.user) &&
        entry.source === filter.source &&
        entry.referenceId === filter.referenceId) || null);
    },
    find(filter) {
      let offset = 0;
      let limit = Infinity;
      return {
        sort() { return this; },
        skip(count) { offset = count; return this; },
        limit(count) { limit = count; return this; },
        lean() {
          return Promise.resolve(transactions
            .filter((entry) =>
              String(entry.user) === String(filter.user) &&
              String(entry.wallet) === String(filter.wallet))
            .sort((first, second) => second.createdAt - first.createdAt)
            .slice(offset, offset + limit));
        },
      };
    },
  };

  const GameSessionModel = {
    findOne(filter) {
      const query = {
        sort() {
          return this;
        },
        session() {
          return this;
        },
        then(resolve, reject) {
          const candidates = gameSessions
            .filter((entry) =>
              entry.user === String(filter.user) &&
              entry.status === filter.status)
            .sort((first, second) => second.startedAt - first.startedAt);
          return Promise.resolve(candidates[0] || null).then(resolve, reject);
        },
      };
      return query;
    },
    async findOneAndUpdate(filter, update) {
      const gameSession = gameSessions.find((entry) =>
        entry._id === String(filter._id) &&
        entry.user === String(filter.user) &&
        entry.status === filter.status &&
        JSON.stringify(entry.actions || []) === JSON.stringify(filter.actions || []));
      if (!gameSession) return null;
      Object.assign(gameSession, update.$set);
      return gameSession;
    },
  };

  const startSession = async () => ({
    async withTransaction(operation) {
      const previousTransaction = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previousTransaction;
      const walletsBefore = new Map(
        [...wallets.entries()].map(([key, value]) => [
          key,
          { ...value, boosterInventory: { ...value.boosterInventory } },
        ]),
      );
      const transactionCount = transactions.length;
      try {
        await operation(this);
      } catch (error) {
        wallets.clear();
        for (const [key, value] of walletsBefore) wallets.set(key, value);
        transactions.length = transactionCount;
        throw error;
      } finally {
        release();
      }
    },
    async endSession() {},
  });

  const UserModel = {
    findById(id) {
      const index = playerIds.indexOf(String(id));
      return Promise.resolve(index < 0 ? null : {
        _id: playerIds[index],
        displayName: `Player ${index + 1}`,
        email: `player${index + 1}@example.test`,
        role: "player",
        isActive: true,
      });
    },
  };

  const walletService = createWalletService({
    WalletModel,
    WalletTransactionModel,
    GameSessionModel,
    levelDefinitions,
    startSession,
  });
  return {
    wallets,
    transactions,
    gameSessions,
    walletService,
    UserModel,
  };
}

async function createServer(options) {
  const context = createWalletHarness(options);
  const app = express();
  app.use(express.json());
  app.use("/api/wallet", createWalletRouter({
    UserModel: context.UserModel,
    walletService: context.walletService,
  }));
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  return {
    ...context,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function addActiveSession(context, {
  userId = playerIds[0],
  levelNumber = 1,
  actions = [],
  status = "in_progress",
} = {}) {
  const gameSession = {
    _id: `${String(context.gameSessions.length + 1).padStart(24, "0")}`,
    user: userId,
    levelNumber,
    actions,
    status,
    startedAt: new Date(),
    updatedAt: new Date(),
  };
  context.gameSessions.push(gameSession);
  return gameSession;
}

function tokenFor(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "apple-worm-adventure",
    audience: "apple-worm-adventure-client",
  });
}

async function request(context, path, { userId = playerIds[0], anonymous = false } = {}) {
  const response = await fetch(`${context.url}${path}`, {
    headers: anonymous ? {} : { Authorization: `Bearer ${tokenFor(userId)}` },
  });
  return { response, body: await response.json() };
}

async function postRequest(context, path, { userId = playerIds[0], anonymous = false, body } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (!anonymous) headers.set("Cookie", `apple_worm_session=${tokenFor(userId)}`);
  const response = await fetch(`${context.url}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test("creates one zero-balance wallet per player and requires authentication", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const unauthenticated = await request(context, "/api/wallet/balance", { anonymous: true });
  const firstRead = await request(context, "/api/wallet/balance");
  const repeatedRead = await request(context, "/api/wallet/balance");
  const secondPlayer = await request(context, "/api/wallet/balance", { userId: playerIds[1] });

  assert.equal(unauthenticated.response.status, 401);
  assert.deepEqual(firstRead.body, { balance: 0, currency: "COIN" });
  assert.deepEqual(repeatedRead.body, { balance: 0, currency: "COIN" });
  assert.deepEqual(secondPlayer.body, { balance: 0, currency: "COIN" });
  assert.equal(context.wallets.size, 2);
});

test("returns only the authenticated player's transaction history", async (t) => {
  const context = await createServer();
  t.after(context.close);
  await context.walletService.credit(playerIds[0], {
    amount: 25,
    reason: "Internal test credit",
    source: "adjustment",
    referenceId: "test-reference",
  });

  const ownHistory = await request(context, "/api/wallet/transactions?limit=10&page=1");
  const otherHistory = await request(context, "/api/wallet/transactions", {
    userId: playerIds[1],
  });

  assert.equal(ownHistory.response.status, 200);
  assert.equal(ownHistory.body.transactions.length, 1);
  assert.deepEqual(
    {
      type: ownHistory.body.transactions[0].type,
      amount: ownHistory.body.transactions[0].amount,
      reason: ownHistory.body.transactions[0].reason,
      source: ownHistory.body.transactions[0].source,
      referenceId: ownHistory.body.transactions[0].referenceId,
    },
    {
      type: "credit",
      amount: 25,
      reason: "Internal test credit",
      source: "adjustment",
      referenceId: "test-reference",
    },
  );
  assert.equal(otherHistory.body.transactions.length, 0);
});

test("updates balance and ledger atomically and prevents an insufficient-balance debit", async (t) => {
  const context = await createServer();
  t.after(context.close);
  await context.walletService.credit(playerIds[0], {
    amount: 12,
    reason: "Test credit",
    source: "adjustment",
  });
  const before = await context.walletService.getBalance({ _id: playerIds[0] });

  await assert.rejects(
    context.walletService.debit(playerIds[0], {
      amount: 13,
      reason: "Attempted debit",
      source: "adjustment",
    }),
    { statusCode: 409, message: "Insufficient coin balance." },
  );
  const after = await context.walletService.getBalance({ _id: playerIds[0] });

  assert.equal(before.balance, 12);
  assert.equal(after.balance, 12);
  assert.equal(context.transactions.length, 1);
  assert.equal(context.transactions[0].type, "credit");

  await context.walletService.debit(playerIds[0], {
    amount: 5,
    reason: "Test debit",
    source: "adjustment",
  });
  const afterDebit = await context.walletService.getBalance({ _id: playerIds[0] });
  assert.equal(afterDebit.balance, 7);
  assert.equal(context.transactions.length, 2);
  assert.equal(context.transactions[1].type, "debit");
  assert.equal(context.transactions[1].amount, 5);

  await assert.rejects(
    context.walletService.credit(playerIds[0], {
      amount: Number.MAX_SAFE_INTEGER,
      reason: "Overflow test",
      source: "adjustment",
    }),
    { statusCode: 409 },
  );
  assert.equal((await context.walletService.getBalance({ _id: playerIds[0] })).balance, 7);
  assert.equal(context.transactions.length, 2);

  await assert.rejects(
    context.walletService.debit(playerIds[0], {
      amount: 1.5,
      reason: "Invalid amount",
      source: "adjustment",
    }),
    { statusCode: 400 },
  );
  await assert.rejects(
    context.walletService.debit(playerIds[0], {
      amount: 1,
      reason: " ",
      source: "adjustment",
    }),
    { statusCode: 400 },
  );
  assert.equal(context.transactions.length, 2);
});

test("purchases supported hints with a server-priced, idempotent debit", async (t) => {
  const context = await createServer();
  t.after(context.close);
  addActiveSession(context);
  const requestId = "7f8e4a5d-bd83-4d19-8f12-55c905ac54df";
  await context.walletService.credit(playerIds[0], {
    amount: 4,
    reason: "Test credit",
    source: "adjustment",
  });
  const insufficient = await postRequest(context, "/api/wallet/hints", {
    body: { requestId },
  });
  assert.equal(insufficient.response.status, 409);
  assert.equal((await context.walletService.getBalance({ _id: playerIds[0] })).balance, 4);
  assert.equal(context.transactions.length, 1);

  await context.walletService.credit(playerIds[0], {
    amount: 6,
    reason: "Test credit",
    source: "adjustment",
  });
  const purchase = await postRequest(context, "/api/wallet/hints", {
    body: { requestId },
  });
  context.gameSessions[0].status = "completed";
  const duplicate = await postRequest(context, "/api/wallet/hints", {
    body: { requestId },
  });

  assert.equal(purchase.response.status, 200);
  assert.equal(purchase.body.balance, 5);
  assert.equal(purchase.body.transaction.type, "debit");
  assert.equal(purchase.body.transaction.amount, 5);
  assert.equal(purchase.body.transaction.reason, "Gameplay hint");
  assert.equal(purchase.body.transaction.source, "gameplay");
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.balance, 5);
  assert.equal(context.transactions.filter((transaction) => transaction.source === "gameplay").length, 1);
  const history = await request(context, "/api/wallet/transactions?limit=10&page=1");
  assert.ok(history.body.transactions.some((transaction) =>
    transaction.type === "debit" &&
    transaction.amount === 5 &&
    transaction.reason === "Gameplay hint" &&
    transaction.source === "gameplay" &&
    transaction.createdAt));
});

test("rejects paid hints without an active session and for completed or failed sessions", async (t) => {
  const context = await createServer();
  t.after(context.close);
  await context.walletService.credit(playerIds[0], {
    amount: 20,
    reason: "Test credit",
    source: "adjustment",
  });
  const requestId = "4da3550a-2252-4c93-8517-6b187c85f0e2";

  const missing = await postRequest(context, "/api/wallet/hints", {
    body: { requestId },
  });
  assert.equal(missing.response.status, 409);

  for (const status of ["completed", "failed"]) {
    addActiveSession(context, { status });
    const finished = await postRequest(context, "/api/wallet/hints", {
      body: { requestId: globalThis.crypto.randomUUID() },
    });
    assert.equal(finished.response.status, 409);
  }

  assert.equal((await context.walletService.getBalance({ _id: playerIds[0] })).balance, 20);
  assert.equal(context.transactions.length, 1);
});

test("rejects a paid hint when authoritative replay has no valid solver result", async (t) => {
  const blockedLevel = {
    number: 1,
    board: {
      rows: 3,
      columns: 3,
      worm: [{ row: 1, column: 1 }],
      apples: [{ row: 0, column: 0 }],
      obstacles: [
        { row: 0, column: 1 },
        { row: 1, column: 0 },
        { row: 1, column: 2 },
        { row: 2, column: 1 },
      ],
      portal: { row: 2, column: 2 },
    },
  };
  const context = await createServer({ levelDefinitions: [blockedLevel] });
  t.after(context.close);
  addActiveSession(context);
  await context.walletService.credit(playerIds[0], {
    amount: 20,
    reason: "Test credit",
    source: "adjustment",
  });

  const result = await postRequest(context, "/api/wallet/hints", {
    body: { requestId: "70b8f513-33f4-4f82-9a9d-b7fa7ab252b0" },
  });

  assert.equal(result.response.status, 409);
  assert.match(result.body.error.message, /No valid hint/);
  assert.equal((await context.walletService.getBalance({ _id: playerIds[0] })).balance, 20);
  assert.equal(context.transactions.length, 1);
});

test("hint purchases require authentication and reject client-selected prices or invalid identifiers", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const requestId = "7f8e4a5d-bd83-4d19-8f12-55c905ac54df";
  const anonymous = await postRequest(context, "/api/wallet/hints", {
    anonymous: true,
    body: { requestId },
  });
  const forgedPrice = await postRequest(context, "/api/wallet/hints", {
    body: { requestId, amount: 1 },
  });
  const invalidId = await postRequest(context, "/api/wallet/hints", {
    body: { requestId: "not-a-uuid" },
  });

  test("purchases boosters at server prices and exposes only the player's inventory", async (t) => {
    const context = await createServer();
    t.after(context.close);
    const requestId = "b3f6ea01-25da-4a14-9df5-6d3fdf2dcb0a";
    await context.walletService.credit(playerIds[0], {
      amount: 40,
      reason: "Test credit",
      source: "adjustment",
    });

    const purchase = await postRequest(context, "/api/wallet/boosters", {
      body: { boosterId: "shield", requestId },
    });
    const duplicate = await postRequest(context, "/api/wallet/boosters", {
      body: { boosterId: "shield", requestId },
    });
    const ownInventory = await request(context, "/api/wallet/boosters");
    const otherInventory = await request(context, "/api/wallet/boosters", {
      userId: playerIds[1],
    });

    assert.equal(purchase.response.status, 200);
    assert.equal(purchase.body.balance, 28);
    assert.equal(purchase.body.inventory.shield, 1);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.balance, 28);
    assert.equal(ownInventory.body.inventory.shield, 1);
    assert.equal(otherInventory.body.inventory.shield, 0);
    assert.equal(purchase.body.transactionId, duplicate.body.transactionId);
    assert.equal(
      context.transactions.filter((transaction) =>
        transaction.reason === "Booster purchase: shield").length,
      1,
    );
    assert.equal(BOOSTER_CATALOG.shield.price, 12);
  });

  test("validates booster purchase IDs, ignores client prices, and rejects unauthenticated access", async (t) => {
    const context = await createServer();
    t.after(context.close);
    const requestId = "b3f6ea01-25da-4a14-9df5-6d3fdf2dcb0a";

    const anonymous = await postRequest(context, "/api/wallet/boosters", {
      anonymous: true,
      body: { boosterId: "undo", requestId },
    });
    const unknown = await postRequest(context, "/api/wallet/boosters", {
      body: { boosterId: "teleport", requestId },
    });
    const forgedPrice = await postRequest(context, "/api/wallet/boosters", {
      body: { boosterId: "undo", requestId, price: 0 },
    });

    assert.equal(anonymous.response.status, 401);
    assert.equal(unknown.response.status, 400);
    assert.equal(forgedPrice.response.status, 400);
    assert.equal(context.transactions.length, 0);
  });

  test("serializes concurrent duplicate booster purchases without double-spending", async (t) => {
    const context = await createServer();
    t.after(context.close);
    await context.walletService.credit(playerIds[0], {
      amount: 12,
      reason: "Test credit",
      source: "adjustment",
    });
    const requestId = "1c068012-2e4f-4bb5-b9a6-c767fc440d7b";

    const purchases = await Promise.all([
      context.walletService.purchaseBooster(
        { _id: playerIds[0] },
        "shield",
        requestId,
      ),
      context.walletService.purchaseBooster(
        { _id: playerIds[0] },
        "shield",
        requestId,
      ),
    ]);
    assert.equal((await context.walletService.getBalance({ _id: playerIds[0] })).balance, 0);
    assert.equal(purchases.filter((purchase) => purchase.duplicate).length, 1);
    assert.equal(purchases.every((purchase) => purchase.inventory.shield === 1), true);
    assert.equal(context.transactions.filter(
      (transaction) => transaction.reason === "Booster purchase: shield",
    ).length, 1);
  });

  test("rejects one of two concurrent purchases that exceed the available balance", async (t) => {
    const context = await createServer();
    t.after(context.close);
    await context.walletService.credit(playerIds[0], {
      amount: 15,
      reason: "Test credit",
      source: "adjustment",
    });

    const results = await Promise.allSettled([
      context.walletService.purchaseBooster(
        { _id: playerIds[0] },
        "undo",
        "8cfd5e98-651f-4f4a-9c2c-c111b58a2181",
      ),
      context.walletService.purchaseBooster(
        { _id: playerIds[0] },
        "shield",
        "ec7ee961-24d2-4e31-b34e-27a1fcff0d9e",
      ),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(
      (result) => result.status === "rejected" && result.reason.statusCode === 409,
    ).length, 1);
    const wallet = await context.walletService.getBoosterInventory({ _id: playerIds[0] });
    assert.ok([3, 7].includes(wallet.balance));
    assert.equal(
      wallet.inventory.undo + wallet.inventory.shield,
      1,
    );
    assert.equal(
      context.transactions.filter((transaction) => transaction.type === "debit").length,
      1,
    );
  });

  test("does not reuse a booster purchase id for a gameplay hint", async (t) => {
    const context = await createServer();
    t.after(context.close);
    await context.walletService.credit(playerIds[0], {
      amount: 20,
      reason: "Test credit",
      source: "adjustment",
    });
    const requestId = "c0a935b3-d182-4d86-b0b7-dc01c10243a1";

    await context.walletService.purchaseBooster(
      { _id: playerIds[0] },
      "undo",
      requestId,
    );
    const duplicatePurpose = await postRequest(context, "/api/wallet/hints", {
      body: { requestId },
    });

    assert.equal(duplicatePurpose.response.status, 409);
    assert.equal((await context.walletService.getBalance({ _id: playerIds[0] })).balance, 12);
    assert.equal(
      (await context.walletService.getBoosterInventory({ _id: playerIds[0] })).inventory.undo,
      1,
    );
    assert.equal(context.transactions.length, 2);
  });

  assert.equal(anonymous.response.status, 401);
  assert.equal(forgedPrice.response.status, 400);
  assert.equal(invalidId.response.status, 400);
  assert.equal(context.transactions.length, 0);
});

test("rejects malformed pagination and offers no client balance mutation route", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const invalidQuery = await request(context, "/api/wallet/transactions?limit=1000");
  const directMutation = await fetch(`${context.url}/api/wallet/balance`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(playerIds[0])}` },
  });

  assert.equal(invalidQuery.response.status, 400);
  assert.equal(directMutation.status, 404);
});
