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
