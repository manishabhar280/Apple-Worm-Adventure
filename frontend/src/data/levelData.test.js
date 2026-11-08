import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { DIFFICULTY_TIERS, levels, TOTAL_LEVELS } from "./levelData.js";
import {
  createInitialGameState,
  moveGame,
} from "../game/gameLogic.js";

test("provides the configured number of complete playable levels", () => {
  assert.equal(TOTAL_LEVELS, 100);
  assert.equal(levels.length, TOTAL_LEVELS);

  for (const [index, level] of levels.entries()) {
    const { rows, columns, worm, apples, obstacles, portal } = level.board;
    const inBounds = ({ row, column }) =>
      row >= 0 && row < rows && column >= 0 && column < columns;

    assert.equal(level.number, index + 1);
    assert.ok(level.name);
    assert.ok(DIFFICULTY_TIERS.includes(level.difficulty));
    assert.ok(rows >= 9 && columns >= 9);
    assert.ok(worm.length >= 1);
    assert.ok(apples.length >= 1);
    assert.ok(worm.every(inBounds));
    assert.ok(apples.every(inBounds));
    assert.ok(obstacles.every(inBounds));
    assert.ok(inBounds(portal));
  }
});

test("preserves the generated definitions of levels 1 through 50", () => {
  const legacyDefinitions = levels.slice(0, 50).map(
    ({ number, name, description, objective, parMoves, board }) => ({
      number,
      name,
      description,
      objective,
      parMoves,
      board,
    }),
  );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(legacyDefinitions))
    .digest("hex");

  assert.equal(
    fingerprint,
    "2ffd41ae372bbb278c3b49b7b70d8fc195c218d49126fb1bad40f205afd986bc",
  );
});

test("preserves the exact fingerprint of all 100 generated levels", () => {
  assert.equal(
    createHash("sha256").update(JSON.stringify(levels)).digest("hex"),
    "7c4e35eefa63bab7a110f1aa32a31bc7d8ce08d40f92d801c241683f8064c27c",
  );
});

test("assigns the five difficulty tiers progressively across 100 levels", () => {
  for (let tierIndex = 0; tierIndex < DIFFICULTY_TIERS.length; tierIndex += 1) {
    const firstLevel = levels[tierIndex * 20];
    const lastLevel = levels[(tierIndex + 1) * 20 - 1];
    assert.equal(firstLevel.difficulty, DIFFICULTY_TIERS[tierIndex]);
    assert.equal(lastLevel.difficulty, DIFFICULTY_TIERS[tierIndex]);
  }
});

test("increases board size, apple count, and obstacle count as levels advance", () => {
  assert.ok(levels.at(-1).board.rows > levels[0].board.rows);
  assert.ok(levels.at(-1).board.columns > levels[0].board.columns);
  assert.ok(levels.at(-1).board.apples.length > levels[0].board.apples.length);
  assert.ok(levels.at(-1).board.obstacles.length > levels[0].board.obstacles.length);
  assert.ok(
    levels.every(
      (level, index) =>
        index === 0 ||
        level.board.obstacles.length > levels[index - 1].board.obstacles.length,
    ),
  );
});

test("keeps every level's apples and portal on a clear connected route", () => {
  for (const level of levels) {
    const { board, parMoves } = level;
    assert.equal(Object.hasOwn(board, "keys"), false);
    assert.equal(Object.hasOwn(board, "gates"), false);
    assert.equal(Object.hasOwn(createInitialGameState(board), "collectedKeyIds"), false);
    const route = [];
    for (let row = 0; row < board.rows; row += 2) {
      const from = route.length === 0 || route[route.length - 1].column === 0;
      if (from) {
        for (let column = 0; column < board.columns; column += 1) {
          route.push({ row, column });
        }
      } else {
        for (let column = board.columns - 1; column >= 0; column -= 1) {
          route.push({ row, column });
        }
      }
      if (row + 1 < board.rows) {
        route.push({
          row: row + 1,
          column: route[route.length - 1].column,
        });
      }
    }

    const routeKeys = new Set(route.map(({ row, column }) => `${row}:${column}`));
    const obstacleKeys = new Set(
      board.obstacles.map(({ row, column }) => `${row}:${column}`),
    );
    assert.ok(board.apples.every(({ row, column }) => routeKeys.has(`${row}:${column}`)));
    assert.ok(route.every(({ row, column }) => !obstacleKeys.has(`${row}:${column}`)));
    assert.equal(`${board.portal.row}:${board.portal.column}`, `${route.at(-1).row}:${route.at(-1).column}`);
    assert.ok(parMoves > 0);

    let game = createInitialGameState(board);
    for (let index = board.worm.length; index < route.length; index += 1) {
      const previous = route[index - 1];
      const next = route[index];
      const direction =
        next.row < previous.row
          ? "up"
          : next.row > previous.row
            ? "down"
            : next.column < previous.column
              ? "left"
              : "right";
      game = moveGame(game, direction, board);
      assert.notEqual(game.status, "lost", `${level.name} should be completable`);
    }

    assert.equal(game.status, "won", `${level.name} should end at its portal`);
    assert.equal(game.moves, parMoves);
  }
});
