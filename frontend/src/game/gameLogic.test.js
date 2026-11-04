import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialGameState,
  findHint,
  moveGame,
  togglePause,
} from "./gameLogic.js";

const board = {
  rows: 5,
  columns: 5,
  worm: [
    { row: 2, column: 1 },
    { row: 2, column: 2 },
  ],
  apples: [{ row: 2, column: 3 }],
  obstacles: [{ row: 1, column: 2 }],
  portal: { row: 0, column: 4 },
};

test("moves one cell and updates the worm without changing its length", () => {
  const initial = createInitialGameState(board);
  const next = moveGame(initial, "down", board);

  assert.equal(next.status, "playing");
  assert.deepEqual(next.worm, [
    { row: 2, column: 2 },
    { row: 3, column: 2 },
  ]);
  assert.equal(next.moves, 1);
  assert.equal(next.worm.length, initial.worm.length);
});

test("collects an apple, grows, and increases the score", () => {
  const initial = createInitialGameState(board);
  const next = moveGame(initial, "right", board);

  assert.equal(next.status, "playing");
  assert.deepEqual(next.worm, [
    { row: 2, column: 1 },
    { row: 2, column: 2 },
    { row: 2, column: 3 },
  ]);
  assert.deepEqual(next.apples, []);
  assert.equal(next.score, 100);
});

test("ends the game when the worm hits an obstacle", () => {
  const initial = createInitialGameState(board);
  const next = moveGame(initial, "up", board);

  assert.equal(next.status, "lost");
  assert.deepEqual(next.worm, initial.worm);
  assert.equal(next.moves, 1);
});

test("ends the game when the head moves into its body", () => {
  const loopBoard = {
    ...board,
    apples: [],
    worm: [
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 3, column: 2 },
      { row: 3, column: 1 },
    ],
    obstacles: [],
  };
  const initial = createInitialGameState(loopBoard);
  const next = moveGame(initial, "right", loopBoard);

  assert.equal(next.status, "lost");
  assert.deepEqual(next.worm, initial.worm);
});

test("allows the head to move into the tail cell when the tail moves away", () => {
  const loopBoard = {
    ...board,
    apples: [],
    worm: [
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 3, column: 2 },
      { row: 3, column: 1 },
    ],
    obstacles: [],
  };
  const next = moveGame(createInitialGameState(loopBoard), "up", loopBoard);

  assert.equal(next.status, "playing");
  assert.deepEqual(next.worm, [
    { row: 2, column: 2 },
    { row: 3, column: 2 },
    { row: 3, column: 1 },
    { row: 2, column: 1 },
  ]);
});

test("does not allow moving into the tail cell while growing on an apple", () => {
  const loopBoard = {
    ...board,
    apples: [{ row: 2, column: 1 }],
    worm: [
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 3, column: 2 },
      { row: 3, column: 1 },
    ],
    obstacles: [],
  };
  const initial = createInitialGameState(loopBoard);
  const next = moveGame(initial, "up", loopBoard);

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, initial.worm);
});

test("blocks movement outside the board without changing game state", () => {
  const edgeBoard = {
    ...board,
    apples: [],
    worm: [{ row: 0, column: 2 }],
  };
  const initial = createInitialGameState(edgeBoard);

  assert.equal(moveGame(initial, "up", edgeBoard), initial);
});

test("wins only after reaching the portal with no apples remaining", () => {
  const portalBoard = {
    ...board,
    worm: [{ row: 0, column: 3 }],
    apples: [],
    obstacles: [],
    portal: { row: 0, column: 4 },
  };
  const initial = createInitialGameState(portalBoard);
  const won = moveGame(initial, "right", portalBoard);

  assert.equal(won.status, "won");
  assert.equal(moveGame(won, "down", portalBoard), won);
});

test("requires every apple before the portal can complete a level", () => {
  const portalBoard = {
    ...board,
    worm: [{ row: 0, column: 3 }],
    apples: [{ row: 4, column: 4 }],
    obstacles: [],
    portal: { row: 0, column: 4 },
  };
  const initial = createInitialGameState(portalBoard);
  const atPortal = moveGame(initial, "right", portalBoard);

  assert.equal(atPortal.status, "playing");
  assert.equal(atPortal.apples.length, 1);
});

test("provides a safe direction toward an apple and then the portal", () => {
  const initial = createInitialGameState(board);
  assert.equal(findHint(initial, board), "right");

  const afterApple = moveGame(initial, "right", board);
  assert.equal(findHint(afterApple, board), "up");
  assert.equal(findHint({ ...afterApple, status: "paused" }, board), null);
});

test("pauses and resumes play, but does not change completed games", () => {
  const initial = createInitialGameState(board);
  const paused = togglePause(initial);
  const resumed = togglePause(paused);
  const won = { ...resumed, status: "won" };

  assert.equal(paused.status, "paused");
  assert.equal(moveGame(paused, "right", board), paused);
  assert.equal(resumed.status, "playing");
  assert.equal(togglePause(won), won);
});
