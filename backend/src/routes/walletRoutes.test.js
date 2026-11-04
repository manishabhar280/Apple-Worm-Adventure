import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { createWalletRouter } from "./walletRoutes.js";
import { createWalletService } from "../services/walletService.js";

process.env.JWT_SECRET ??= "test_only_secret_that_is_not_used_in_production_12345";
const playerIds = ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"];

function createWalletHarness() {
  const wallets = new Map();
  const transactions = [];
  let nextId = 1;
  const WalletModel = {
    async findOneAndUpdate(filter, update, options = {}) {
      let wallet = wallets.get(String(filter.user));
      if (update.$setOnInsert) {
        if (!wallet && options.upsert) {
          wallet = {
            _id: `${String(nextId++).padStart(24, "0")}`,
            ...update.$setOnInsert,
          };
          wallets.set(String(filter.user), wallet);
        }
        return wallet || null;
      }

      if (
        !wallet ||
        String(wallet._id) !== String(filter._id) ||
        (filter.balance?.$gte !== undefined && wallet.balance < filter.balance.$gte) ||
        (filter.balance?.$lte !== undefined && wallet.balance > filter.balance.$lte)
      ) {
        return null;
      }
      wallet.balance += update.$inc.balance;
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

  const startSession = async () => ({
    async withTransaction(operation) {
      const walletsBefore = new Map(
        [...wallets.entries()].map(([key, value]) => [key, { ...value }]),
      );
      const transactionCount = transactions.length;
      try {
        await operation(this);
      } catch (error) {
        wallets.clear();
        for (const [key, value] of walletsBefore) wallets.set(key, value);
        transactions.length = transactionCount;
        throw error;
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
    startSession,
  });
  return {
    wallets,
    transactions,
    walletService,
    UserModel,
  };
}

async function createServer() {
  const context = createWalletHarness();
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

  await context.walletService.credit(playerIds[0], {
    amount: 6,
    reason: "Test credit",
    source: "adjustment",
  });
  const purchase = await postRequest(context, "/api/wallet/hints", {
    body: { requestId },
  });
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
