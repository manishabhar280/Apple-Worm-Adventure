import assert from "node:assert/strict";
import test from "node:test";
import { levels } from "../data/levelData.js";
import { createInitialGameState } from "./gameLogic.js";
import { requestGameHint } from "./walletActions.js";

test("does not charge for a hint when no safe hint is available", async () => {
  let purchases = 0;
  const game = { ...createInitialGameState(levels[0].board), status: "won" };

  const result = await requestGameHint({
    game,
    board: levels[0].board,
    requestId: "attempt-1",
    onPurchaseHint: async () => { purchases += 1; },
  });

  assert.deepEqual(result, { direction: null, purchase: null });
  assert.equal(purchases, 0);
});

test("does not charge for hints on boards with unsupported mechanics", async () => {
  const baseBoard = {
    rows: 4,
    columns: 4,
    worm: [{ row: 1, column: 0 }],
    apples: [{ row: 1, column: 3 }],
    obstacles: [],
    portal: { row: 3, column: 3 },
  };
  const mechanicBoards = [
    {
      ...baseBoard,
      keys: [{ id: "key", row: 0, column: 0 }],
      gates: [{ id: "gate", keyId: "key", row: 0, column: 1 }],
    },
    {
      ...baseBoard,
      teleports: [{
        id: "pair",
        entry: { row: 0, column: 1 },
        exit: { row: 2, column: 2 },
      }],
    },
    {
      ...baseBoard,
      movingObstacles: [{
        id: "patroller",
        path: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
      }],
    },
    {
      ...baseBoard,
      iceTiles: [{ row: 0, column: 0 }],
    },
  ];
  let purchases = 0;

  for (const board of mechanicBoards) {
    const result = await requestGameHint({
      game: createInitialGameState(board),
      board,
      requestId: "attempt-1",
      onPurchaseHint: async () => { purchases += 1; },
    });
    assert.deepEqual(result, { direction: null, purchase: null });
  }

  assert.equal(purchases, 0);
});

test("does not charge for hints on limited-move challenge levels", async () => {
  let purchases = 0;
  const game = createInitialGameState(levels[0].board, 3);
  const result = await requestGameHint({
    game,
    board: levels[0].board,
    moveLimit: 3,
    requestId: "challenge-attempt",
    onPurchaseHint: async () => { purchases += 1; },
  });

  assert.deepEqual(result, { direction: null, purchase: null });
  assert.equal(purchases, 0);
});

test("purchases a supported hint before revealing it and reuses the same idempotency key", async () => {
  const calls = [];
  const request = () => requestGameHint({
    game: createInitialGameState(levels[0].board),
    board: levels[0].board,
    requestId: "attempt-1",
    onPurchaseHint: async (requestId) => {
      calls.push(requestId);
      return { balance: 7, duplicate: calls.length > 1 };
    },
  });
  const firstResult = await request();
  const replayResult = await request();

  assert.ok(firstResult.direction);
  assert.ok(replayResult.direction);
  assert.deepEqual(firstResult.purchase, { balance: 7, duplicate: false });
  assert.deepEqual(replayResult.purchase, { balance: 7, duplicate: true });
  assert.deepEqual(calls, ["attempt-1", "attempt-1"]);
});

test("does not reveal a paid hint when the server rejects an insufficient balance", async () => {
  await assert.rejects(
    requestGameHint({
      game: createInitialGameState(levels[0].board),
      board: levels[0].board,
      requestId: "attempt-1",
      onPurchaseHint: async () => {
        throw Object.assign(new Error("Insufficient coin balance."), { status: 409 });
      },
    }),
    { message: "Insufficient coin balance.", status: 409 },
  );
});

test("uses a hint booster only after the solver finds a valid move", async () => {
  let boosterUses = 0;
  let purchases = 0;
  const result = await requestGameHint({
    game: createInitialGameState(levels[0].board),
    board: levels[0].board,
    onUseBooster: async () => {
      boosterUses += 1;
      return { inventory: { hint: 0 } };
    },
    onPurchaseHint: async () => { purchases += 1; },
  });

  assert.ok(result.direction);
  assert.deepEqual(result.purchase, { inventory: { hint: 0 } });
  assert.equal(boosterUses, 1);
  assert.equal(purchases, 0);
});
