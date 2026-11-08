import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDynamicBoardIndexes,
  buildStaticBoardIndexes,
} from "./boardIndexes.js";

test("indexes static board entities by cell without changing their definitions", () => {
  const board = {
    columns: 5,
    obstacles: [{ row: 1, column: 2 }],
    keys: [{ id: "key-a", row: 2, column: 1 }],
    gates: [{ keyId: "key-a", row: 3, column: 4 }],
    teleports: [{
      id: "portal-a",
      entry: { row: 0, column: 4 },
      exit: { row: 4, column: 0 },
    }],
    iceTiles: [{ row: 4, column: 3 }],
  };

  const indexes = buildStaticBoardIndexes(board);
  assert.equal(indexes.obstacleIndices.has(7), true);
  assert.equal(indexes.keyByCell.get(11), board.keys[0]);
  assert.equal(indexes.gateByCell.get(19), board.gates[0]);
  assert.deepEqual(indexes.teleportEntryByCell.get(4), board.teleports[0].entry);
  assert.deepEqual(indexes.teleportExitByCell.get(20), board.teleports[0].exit);
  assert.equal(indexes.iceIndices.has(23), true);
  assert.deepEqual(board.obstacles, [{ row: 1, column: 2 }]);
});

test("indexes current worm, apples, and moving obstacles with first-position precedence", () => {
  const worm = [
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
  ];
  const apples = [{ row: 3, column: 4 }];
  const obstacles = [
    { id: "first", row: 2, column: 0 },
    { id: "second", row: 2, column: 0 },
  ];

  const indexes = buildDynamicBoardIndexes(
    5,
    { worm, apples },
    obstacles,
  );
  assert.equal(indexes.wormIndexByCell.get(1), 0);
  assert.equal(indexes.wormIndexByCell.get(6), 1);
  assert.equal(indexes.wormIndexByCell.get(7), 2);
  assert.equal(indexes.appleIndices.has(19), true);
  assert.equal(indexes.movingObstacleByCell.get(10), obstacles[0]);
});

test("supports boards without optional static entities", () => {
  const indexes = buildStaticBoardIndexes({
    columns: 2,
    obstacles: [],
  });

  assert.equal(indexes.keyByCell.size, 0);
  assert.equal(indexes.gateByCell.size, 0);
  assert.equal(indexes.teleportEntryByCell.size, 0);
  assert.equal(indexes.teleportExitByCell.size, 0);
  assert.equal(indexes.iceIndices.size, 0);
});
