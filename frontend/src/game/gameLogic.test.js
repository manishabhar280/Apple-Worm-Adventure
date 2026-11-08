import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialGameState,
  findHint,
  getMovingObstaclePositions,
  isChallengeLevel,
  moveGame,
  replayGameActions,
  togglePause,
  validateIceTileBoard,
  validateKeyGateBoard,
  validateMovingObstacleBoard,
  validateTeleportBoard,
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

const keyGateBoard = {
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
};

const teleportBoard = {
  rows: 7,
  columns: 7,
  worm: [
    { row: 3, column: 0 },
    { row: 3, column: 1 },
  ],
  apples: [],
  obstacles: [],
  portal: { row: 6, column: 6 },
  teleports: [{
    id: "portal-pair-1",
    entry: { row: 3, column: 2 },
    exit: { row: 1, column: 5 },
  }],
};

const movingObstacleBoard = {
  rows: 6,
  columns: 7,
  worm: [
    { row: 3, column: 0 },
    { row: 3, column: 1 },
  ],
  apples: [{ row: 5, column: 5 }],
  obstacles: [],
  portal: { row: 5, column: 6 },
  movingObstacles: [{
    id: "patroller",
    path: [
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 1, column: 1 },
    ],
  }],
};

const iceBoard = {
  rows: 5,
  columns: 7,
  worm: [{ row: 2, column: 0 }],
  apples: [],
  obstacles: [],
  portal: { row: 4, column: 6 },
  iceTiles: [
    { row: 2, column: 1 },
    { row: 2, column: 2 },
    { row: 2, column: 3 },
  ],
};

function moveRight(state, currentBoard = keyGateBoard) {
  return moveGame(state, "right", currentBoard);
}

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

test("undo restores the exact state before the latest accepted move, including keys and apples", () => {
  const before = createInitialGameState(keyGateBoard);
  const afterKey = moveRight(before);
  assert.deepEqual(afterKey.collectedKeyIds, ["bronze"]);

  const undone = replayGameActions(
    keyGateBoard,
    ["right", "booster:undo"],
  );
  assert.deepEqual(undone.worm, before.worm);
  assert.deepEqual(undone.apples, before.apples);
  assert.deepEqual(undone.collectedKeyIds, []);
  assert.equal(undone.moves, 0);
  assert.equal(undone.score, 0);
  assert.equal(undone.canUndo, false);
  assert.deepEqual(afterKey.worm, [
    { row: 2, column: 1 },
    { row: 2, column: 2 },
  ]);
});

test("rejects undo without a move and after a terminal result", () => {
  assert.throws(
    () => replayGameActions(keyGateBoard, ["booster:undo"]),
    /previous accepted move/,
  );
  assert.throws(
    () => replayGameActions(keyGateBoard, ["right", "right", "right", "right", "right", "booster:undo"]),
    /after a game has ended/,
  );
});

test("shield prevents one eligible collision but never bypasses board boundaries", () => {
  const initial = createInitialGameState(board);
  const shielded = replayGameActions(board, ["booster:shield", "up"]);
  assert.equal(shielded.status, "playing");
  assert.deepEqual(shielded.worm, initial.worm);
  assert.equal(shielded.moves, 1);
  assert.equal(shielded.shieldActive, false);
  assert.equal(shielded.shieldConsumed, true);

  const edgeBoard = {
    ...board,
    worm: [{ row: 0, column: 2 }],
    apples: [],
    obstacles: [],
  };
  const activeShield = replayGameActions(edgeBoard, ["booster:shield"]);
  const blocked = moveGame(activeShield, "up", edgeBoard);
  assert.equal(blocked, activeShield);
  assert.equal(blocked.shieldActive, true);
  assert.equal(blocked.moves, 0);
});

test("extra moves extend a challenge by three per use and enforce the two-use cap", () => {
  const challengeBoard = {
    rows: 5,
    columns: 5,
    worm: [{ row: 2, column: 2 }],
    apples: [{ row: 4, column: 4 }],
    obstacles: [],
    portal: { row: 0, column: 4 },
    moveLimit: 2,
  };
  const actions = [
    "booster:extra_moves",
    "up",
    "up",
    "right",
    "right",
    "down",
  ];
  const result = replayGameActions(challengeBoard, actions, 2);
  assert.equal(result.status, "lost");
  assert.equal(result.failureReason, "move-limit");
  assert.equal(result.moves, 5);
  assert.equal(result.extraMovesAdded, 3);
  assert.throws(
    () => replayGameActions(challengeBoard, [
      "booster:extra_moves",
      "booster:extra_moves",
      "booster:extra_moves",
    ], 2),
    /exceed its cap/,
  );
});

test("freeze holds moving obstacles for three accepted actions and replays deterministically", () => {
  const actions = [
    "booster:freeze",
    "right",
    "right",
    "right",
    "right",
  ];
  const first = replayGameActions(movingObstacleBoard, actions);
  const second = replayGameActions(movingObstacleBoard, actions);
  assert.deepEqual(first, second);
  assert.equal(first.freezeActionsRemaining, 0);
  assert.equal(first.movingObstacleOffset, 3);
  assert.deepEqual(
    getMovingObstaclePositions(movingObstacleBoard, first.moves - first.movingObstacleOffset),
    getMovingObstaclePositions(movingObstacleBoard, 1),
  );
  assert.throws(
    () => replayGameActions(board, ["booster:freeze"]),
    /requires moving obstacles/,
  );
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
  const playing = moveGame(initial, "right", board);
  const paused = togglePause(playing);
  const resumed = togglePause(paused);
  const won = { ...resumed, status: "won" };

  assert.equal(paused.status, "paused");
  assert.equal(moveGame(paused, "down", board), paused);
  assert.equal(resumed.status, "playing");
  assert.deepEqual(resumed, playing);
  assert.equal(togglePause(won), won);
});

test("collects a key into derived game state", () => {
  const next = moveRight(createInitialGameState(keyGateBoard));

  assert.deepEqual(next.collectedKeyIds, ["bronze"]);
  assert.deepEqual(next.worm.at(-1), { row: 2, column: 2 });
  assert.equal(next.moves, 1);
});

test("loses when entering a gate without its matching key", () => {
  const lockedBoard = {
    ...keyGateBoard,
    keys: [{ id: "bronze", row: 0, column: 0 }],
    gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 2 }],
  };
  const next = moveRight(createInitialGameState(lockedBoard), lockedBoard);

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, lockedBoard.worm);
  assert.deepEqual(next.collectedKeyIds, []);
});

test("opens a gate after collecting its matching key", () => {
  const initial = createInitialGameState(keyGateBoard);
  const afterKey = moveRight(initial);
  const afterGate = moveRight(afterKey);

  assert.deepEqual(afterGate.collectedKeyIds, ["bronze"]);
  assert.equal(afterGate.status, "playing");
  assert.deepEqual(afterGate.worm.at(-1), { row: 2, column: 3 });
});

test("can cross an already-open gate again", () => {
  const gateBoard = {
    rows: 5,
    columns: 5,
    worm: [
      { row: 2, column: 0 },
      { row: 2, column: 1 },
    ],
    apples: [],
    obstacles: [],
    portal: { row: 0, column: 4 },
    keys: [{ id: "bronze", row: 2, column: 2 }],
    gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 3 }],
  };
  let state = createInitialGameState(gateBoard);
  for (const direction of ["right", "right", "down", "left", "up", "right"]) {
    state = moveGame(state, direction, gateBoard);
  }

  assert.equal(state.status, "playing");
  assert.deepEqual(state.collectedKeyIds, ["bronze"]);
  assert.deepEqual(state.worm.at(-1), { row: 2, column: 3 });
});

test("a different collected key does not open a gate", () => {
  const wrongKeyBoard = {
    ...keyGateBoard,
    keys: [
      { id: "bronze", row: 0, column: 0 },
      { id: "silver", row: 2, column: 2 },
    ],
  };
  const afterSilverKey = moveRight(createInitialGameState(wrongKeyBoard), wrongKeyBoard);
  const atGate = moveRight(afterSilverKey, wrongKeyBoard);

  assert.deepEqual(afterSilverKey.collectedKeyIds, ["silver"]);
  assert.equal(atGate.status, "lost");
  assert.deepEqual(atGate.worm, afterSilverKey.worm);
});

test("supports multiple keys and independently matching gates", () => {
  const multipleBoard = {
    rows: 5,
    columns: 8,
    worm: [
      { row: 2, column: 0 },
      { row: 2, column: 1 },
    ],
    apples: [{ row: 2, column: 6 }],
    obstacles: [],
    portal: { row: 2, column: 7 },
    keys: [
      { id: "bronze", row: 2, column: 2 },
      { id: "silver", row: 2, column: 4 },
    ],
    gates: [
      { id: "bronze-gate", keyId: "bronze", row: 2, column: 3 },
      { id: "silver-gate", keyId: "silver", row: 2, column: 5 },
    ],
  };
  let state = createInitialGameState(multipleBoard);
  for (let index = 0; index < 6; index += 1) {
    state = moveRight(state, multipleBoard);
  }

  assert.equal(state.status, "won");
  assert.deepEqual(state.collectedKeyIds, ["bronze", "silver"]);
  assert.equal(state.score, 100);
});

test("a collision before a gate preserves collected keys and loses the attempt", () => {
  const blockedBoard = {
    ...keyGateBoard,
    obstacles: [{ row: 2, column: 3 }],
    gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 4 }],
  };
  const afterKey = moveRight(createInitialGameState(blockedBoard), blockedBoard);
  const collision = moveRight(afterKey, blockedBoard);

  assert.equal(collision.status, "lost");
  assert.deepEqual(collision.collectedKeyIds, ["bronze"]);
  assert.deepEqual(collision.worm, afterKey.worm);
});

test("validates key and gate identifiers, references, bounds, and overlaps", () => {
  assert.equal(validateKeyGateBoard(keyGateBoard), true);

  const invalidBoards = [
    { ...keyGateBoard, keys: [{ id: "bronze", row: 2, column: 2 }, { id: "bronze", row: 3, column: 2 }] },
    { ...keyGateBoard, keys: [{ id: "bronze", row: 2, column: 2 }, { id: "silver", row: 2, column: 2 }] },
    { ...keyGateBoard, gates: [{ id: "bronze-gate", keyId: "missing", row: 2, column: 3 }] },
    { ...keyGateBoard, gates: [{ id: "bronze", keyId: "bronze", row: 2, column: 3 }] },
    { ...keyGateBoard, gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 3 }, { id: "bronze-gate", keyId: "bronze", row: 3, column: 3 }] },
    { ...keyGateBoard, keys: [{ id: "bronze", row: 5, column: 2 }] },
    { ...keyGateBoard, keys: [{ id: "bronze", row: 2, column: 1 }] },
    { ...keyGateBoard, keys: [{ id: "bronze", row: 2, column: 5 }] },
    { ...keyGateBoard, keys: [{ id: "bronze", row: 1, column: 1 }], obstacles: [{ row: 1, column: 1 }] },
    { ...keyGateBoard, keys: [{ id: "bronze", row: 2, column: 6 }] },
    { ...keyGateBoard, gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 6 }] },
    { ...keyGateBoard, gates: [{ id: "bronze", keyId: "bronze", row: 3, column: 3 }] },
  ];

  for (const invalidBoard of invalidBoards) {
    assert.throws(() => createInitialGameState(invalidBoard));
  }
});

test("replaying the same key and gate actions deterministically produces the same result", () => {
  const actions = ["right", "right", "right", "right", "right"];
  const first = replayGameActions(keyGateBoard, actions);
  const second = replayGameActions(keyGateBoard, actions);

  assert.deepEqual(first, second);
  assert.equal(first.status, "won");
  assert.deepEqual(first.collectedKeyIds, ["bronze"]);
});

test("hints are unavailable on key and gate boards", () => {
  assert.equal(findHint(createInitialGameState(keyGateBoard), keyGateBoard), null);
});

test("teleports on entry and shift the body to the linked exit in one move", () => {
  const initial = createInitialGameState(teleportBoard);
  const next = moveGame(initial, "right", teleportBoard);

  assert.equal(next.status, "playing");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, [
    { row: 3, column: 1 },
    { row: 1, column: 5 },
  ]);
});

test("loses when a teleport exit is occupied by a static obstacle", () => {
  const initial = createInitialGameState(teleportBoard);
  const blockedBoard = {
    ...teleportBoard,
    obstacles: [{ row: 1, column: 5 }],
  };
  const next = moveGame(initial, "right", blockedBoard);

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, initial.worm);
});

test("loses when a teleport exit is occupied by the worm body", () => {
  const initial = createInitialGameState(teleportBoard);
  const occupiedState = {
    ...initial,
    worm: [
      { row: 3, column: 0 },
      { row: 1, column: 5 },
      { row: 3, column: 1 },
    ],
  };
  const next = moveGame(occupiedState, "right", teleportBoard);

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, occupiedState.worm);
});

test("validates teleport IDs, endpoint bounds, distinctness, and incompatible overlaps", () => {
  assert.equal(validateTeleportBoard(teleportBoard), true);

  const invalidBoards = [
    { ...teleportBoard, teleports: [{ ...teleportBoard.teleports[0], id: "" }] },
    { ...teleportBoard, teleports: [teleportBoard.teleports[0], { ...teleportBoard.teleports[0] }] },
    { ...teleportBoard, teleports: [{ ...teleportBoard.teleports[0], exit: { row: 3, column: 2 } }] },
    { ...teleportBoard, teleports: [{ ...teleportBoard.teleports[0], entry: { row: -1, column: 2 } }] },
    { ...teleportBoard, teleports: [{ ...teleportBoard.teleports[0], exit: { row: 7, column: 5 } }] },
    { ...teleportBoard, teleports: [teleportBoard.teleports[0], { id: "second", entry: { row: 1, column: 5 }, exit: { row: 0, column: 0 } }] },
    { ...teleportBoard, worm: [{ row: 3, column: 0 }, { row: 3, column: 2 }] },
    { ...teleportBoard, apples: [{ row: 3, column: 2 }] },
    { ...teleportBoard, obstacles: [{ row: 1, column: 5 }] },
    { ...teleportBoard, portal: { row: 1, column: 5 } },
    { ...teleportBoard, keys: [{ id: "key", row: 3, column: 2 }] },
    { ...teleportBoard, gates: [{ id: "gate", keyId: "key", row: 1, column: 5 }] },
    { ...teleportBoard, iceTiles: [{ row: 3, column: 2 }] },
  ];

  for (const invalidBoard of invalidBoards) {
    assert.throws(() => createInitialGameState(invalidBoard));
  }
});

test("does not chain teleports when an exit is another pair's entry", () => {
  const boardWithChainedExit = {
    ...teleportBoard,
    teleports: [
      teleportBoard.teleports[0],
      {
        id: "portal-pair-2",
        entry: { row: 1, column: 5 },
        exit: { row: 0, column: 0 },
      },
    ],
  };

  assert.throws(() => createInitialGameState(boardWithChainedExit));
});

test("preserves goal portal behavior on a board with teleporters", () => {
  const boardWithGoal = {
    ...teleportBoard,
    apples: [{ row: 6, column: 5 }],
    worm: [{ row: 6, column: 3 }],
    teleports: [{
      id: "portal-pair-1",
      entry: { row: 3, column: 2 },
      exit: { row: 1, column: 5 },
    }],
  };
  const initial = createInitialGameState(boardWithGoal);
  const atApple = moveGame(initial, "right", boardWithGoal);
  const afterApple = moveGame(atApple, "right", boardWithGoal);
  const atGoal = moveGame(afterApple, "right", boardWithGoal);

  assert.equal(atGoal.status, "won");
  assert.equal(atGoal.score, 100);
});

test("teleport movement composes with existing key and gate rules", () => {
  const boardWithKeyGate = {
    ...teleportBoard,
    portal: { row: 0, column: 3 },
    keys: [{ id: "bronze", row: 0, column: 5 }],
    gates: [{ id: "bronze-gate", keyId: "bronze", row: 0, column: 4 }],
  };
  let state = createInitialGameState(boardWithKeyGate);
  for (const direction of ["right", "up", "left", "left"]) {
    state = moveGame(state, direction, boardWithKeyGate);
  }

  assert.equal(state.status, "won");
  assert.deepEqual(state.collectedKeyIds, ["bronze"]);
  assert.deepEqual(state.worm.at(-1), boardWithKeyGate.portal);
});

test("teleport replay is deterministic and hints are unavailable", () => {
  const actions = ["right", "down", "left"];
  const first = replayGameActions(teleportBoard, actions);
  const second = replayGameActions(teleportBoard, actions);

  assert.deepEqual(first, second);
  assert.equal(findHint(createInitialGameState(teleportBoard), teleportBoard), null);
});

test("moving obstacles advance after each valid in-bounds move", () => {
  const initial = createInitialGameState(movingObstacleBoard);
  const next = moveGame(initial, "right", movingObstacleBoard);

  assert.deepEqual(getMovingObstaclePositions(movingObstacleBoard, initial.moves), [
    { id: "patroller", row: 0, column: 0 },
  ]);
  assert.deepEqual(getMovingObstaclePositions(movingObstacleBoard, next.moves), [
    { id: "patroller", row: 0, column: 1 },
  ]);
  assert.equal(next.moves, 1);
});

test("moving obstacle paths repeat cyclically", () => {
  const cycleBoard = {
    ...movingObstacleBoard,
    movingObstacles: [{
      id: "patroller",
      path: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
    }],
  };
  let state = createInitialGameState(cycleBoard);
  for (const direction of ["up", "down", "down", "down"]) {
    state = moveGame(state, direction, cycleBoard);
  }

  assert.equal(state.moves, 4);
  assert.deepEqual(
    getMovingObstaclePositions(cycleBoard, state.moves),
    getMovingObstaclePositions(cycleBoard, 0),
  );
});

test("moving obstacles replay deterministically from direction actions", () => {
  const actions = ["up", "down", "down", "down"];
  const first = replayGameActions(movingObstacleBoard, actions);
  const second = replayGameActions(movingObstacleBoard, actions);

  assert.deepEqual(first, second);
  assert.deepEqual(
    getMovingObstaclePositions(movingObstacleBoard, first.moves),
    getMovingObstaclePositions(movingObstacleBoard, second.moves),
  );
});

test("invalid directions and out-of-bounds moves do not advance moving obstacles", () => {
  const initial = createInitialGameState(movingObstacleBoard);
  assert.equal(moveGame(initial, "north-east", movingObstacleBoard), initial);
  assert.deepEqual(getMovingObstaclePositions(movingObstacleBoard, initial.moves), [
    { id: "patroller", row: 0, column: 0 },
  ]);

  const edgeBoard = {
    ...movingObstacleBoard,
    worm: [{ row: 0, column: 0 }],
    movingObstacles: [{
      id: "patroller",
      path: [{ row: 5, column: 0 }, { row: 5, column: 1 }],
    }],
  };
  const edgeState = createInitialGameState(edgeBoard);
  assert.equal(moveGame(edgeState, "up", edgeBoard), edgeState);
  assert.equal(edgeState.moves, 0);
  assert.deepEqual(getMovingObstaclePositions(edgeBoard, edgeState.moves), [
    { id: "patroller", row: 5, column: 0 },
  ]);
});

test("a moving obstacle colliding with the worm causes the existing loss outcome", () => {
  const collisionBoard = {
    ...movingObstacleBoard,
    worm: [{ row: 2, column: 0 }, { row: 2, column: 1 }],
    movingObstacles: [{
      id: "patroller",
      path: [{ row: 0, column: 0 }, { row: 2, column: 2 }],
    }],
  };
  const initial = createInitialGameState(collisionBoard);
  const next = moveGame(initial, "right", collisionBoard);

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, initial.worm);
  assert.deepEqual(getMovingObstaclePositions(collisionBoard, next.moves), [
    { id: "patroller", row: 2, column: 2 },
  ]);
});

test("supports multiple moving obstacles with separate deterministic paths", () => {
  const boardWithMultiple = {
    ...movingObstacleBoard,
    movingObstacles: [
      {
        id: "north-patroller",
        path: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
      },
      {
        id: "south-patroller",
        path: [{ row: 1, column: 0 }, { row: 1, column: 1 }],
      },
    ],
  };

  assert.equal(validateMovingObstacleBoard(boardWithMultiple), true);
  assert.deepEqual(getMovingObstaclePositions(boardWithMultiple, 1), [
    { id: "north-patroller", row: 0, column: 1 },
    { id: "south-patroller", row: 1, column: 1 },
  ]);
});

test("validates moving obstacle IDs, path length, coordinates, duplicates, and overlaps", () => {
  const obstacle = movingObstacleBoard.movingObstacles[0];
  const invalidBoards = [
    { ...movingObstacleBoard, movingObstacles: [{ ...obstacle, id: "" }] },
    {
      ...movingObstacleBoard,
      movingObstacles: [obstacle, { ...obstacle, path: [{ row: 2, column: 2 }, { row: 2, column: 3 }] }],
    },
    { ...movingObstacleBoard, movingObstacles: [{ ...obstacle, path: [{ row: 0, column: 0 }] }] },
    { ...movingObstacleBoard, movingObstacles: [{ ...obstacle, path: [{ row: 0, column: 0 }, { row: 6, column: 1 }] }] },
    {
      ...movingObstacleBoard,
      movingObstacles: [{ ...obstacle, path: [{ row: 0, column: 0 }, { row: 0, column: 0 }] }],
    },
    {
      ...movingObstacleBoard,
      movingObstacles: [{ ...obstacle, path: [{ row: 0, column: 0 }, { row: 3, column: 0 }] }],
    },
    {
      ...movingObstacleBoard,
      movingObstacles: [{
        ...obstacle,
        path: [{ row: 0, column: 0 }, movingObstacleBoard.apples[0]],
      }],
    },
    {
      ...movingObstacleBoard,
      movingObstacles: [{
        ...obstacle,
        path: [{ row: 0, column: 0 }, movingObstacleBoard.portal],
      }],
    },
    {
      ...movingObstacleBoard,
      obstacles: [{ row: 0, column: 1 }],
    },
    {
      ...movingObstacleBoard,
      keys: [{ id: "bronze", row: 0, column: 1 }],
    },
    {
      ...movingObstacleBoard,
      keys: [{ id: "bronze", row: 1, column: 0 }],
      gates: [{ id: "bronze-gate", keyId: "bronze", row: 0, column: 1 }],
    },
    {
      ...movingObstacleBoard,
      teleports: [{
        id: "pair",
        entry: { row: 0, column: 1 },
        exit: { row: 1, column: 0 },
      }],
    },
    {
      ...movingObstacleBoard,
      movingObstacles: [
        obstacle,
        {
          id: "second-patroller",
          path: [{ row: 0, column: 0 }, { row: 1, column: 0 }],
        },
      ],
    },
  ];

  for (const invalidBoard of invalidBoards) {
    assert.throws(() => createInitialGameState(invalidBoard));
  }
});

test("moving obstacles compose with keys, gates, and teleport portals", () => {
  const keyGateWithMovingObstacle = {
    ...keyGateBoard,
    movingObstacles: [{
      id: "patroller",
      path: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
    }],
  };
  const keyState = moveRight(
    createInitialGameState(keyGateWithMovingObstacle),
    keyGateWithMovingObstacle,
  );
  const gateState = moveRight(keyState, keyGateWithMovingObstacle);
  assert.deepEqual(keyState.collectedKeyIds, ["bronze"]);
  assert.deepEqual(gateState.worm.at(-1), { row: 2, column: 3 });
  assert.equal(gateState.status, "playing");

  const teleportWithMovingObstacle = {
    ...teleportBoard,
    movingObstacles: [{
      id: "patroller",
      path: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
    }],
  };
  const teleported = moveGame(
    createInitialGameState(teleportWithMovingObstacle),
    "right",
    teleportWithMovingObstacle,
  );
  assert.deepEqual(teleported.worm.at(-1), { row: 1, column: 5 });
  assert.equal(teleported.status, "playing");
});

test("moving obstacles do not change goal portal completion", () => {
  const goalBoard = {
    ...movingObstacleBoard,
    worm: [{ row: 0, column: 3 }],
    apples: [],
    portal: { row: 0, column: 4 },
  };
  const complete = moveGame(createInitialGameState(goalBoard), "right", goalBoard);

  assert.equal(complete.status, "won");
  assert.equal(complete.moves, 1);
});

test("entering connected ice makes the worm slide until it leaves the ice", () => {
  const initial = createInitialGameState(iceBoard);
  const next = moveGame(initial, "right", iceBoard);

  assert.equal(next.status, "playing");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, [{ row: 2, column: 4 }]);
});

test("the worm stops on the first non-ice cell after an ice path", () => {
  const shortIcePath = {
    ...iceBoard,
    iceTiles: [{ row: 2, column: 1 }, { row: 2, column: 2 }],
  };
  const next = moveGame(createInitialGameState(shortIcePath), "right", shortIcePath);

  assert.deepEqual(next.worm, [{ row: 2, column: 3 }]);
  assert.equal(next.moves, 1);
});

test("sliding collects and grows on an apple before continuing", () => {
  const appleOnIce = {
    ...iceBoard,
    apples: [{ row: 2, column: 2 }],
  };
  const next = moveGame(createInitialGameState(appleOnIce), "right", appleOnIce);

  assert.deepEqual(next.apples, []);
  assert.equal(next.score, 100);
  assert.deepEqual(next.worm, [
    { row: 2, column: 3 },
    { row: 2, column: 4 },
  ]);
  assert.equal(next.moves, 1);
});

test("sliding collects a key and crosses its now-open gate on ice", () => {
  const iceKeyGateBoard = {
    ...iceBoard,
    columns: 7,
    apples: [{ row: 2, column: 5 }],
    portal: { row: 2, column: 6 },
    iceTiles: [
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 2, column: 3 },
      { row: 2, column: 4 },
    ],
    keys: [{ id: "bronze", row: 2, column: 2 }],
    gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 3 }],
  };
  const next = moveGame(
    createInitialGameState(iceKeyGateBoard),
    "right",
    iceKeyGateBoard,
  );

  assert.deepEqual(next.collectedKeyIds, ["bronze"]);
  assert.deepEqual(next.apples, []);
  assert.equal(next.score, 100);
  assert.deepEqual(next.worm.at(-1), { row: 2, column: 5 });
  assert.equal(next.moves, 1);
});

test("a locked gate stops a slide with the existing loss outcome", () => {
  const lockedGateBoard = {
    ...iceBoard,
    iceTiles: [{ row: 2, column: 1 }, { row: 2, column: 2 }],
    keys: [{ id: "bronze", row: 0, column: 0 }],
    gates: [{ id: "bronze-gate", keyId: "bronze", row: 2, column: 3 }],
  };
  const next = moveGame(
    createInitialGameState(lockedGateBoard),
    "right",
    lockedGateBoard,
  );

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, [{ row: 2, column: 2 }]);
});

test("sliding into a teleport resolves it once and stops at its non-ice exit", () => {
  const iceTeleportBoard = {
    ...iceBoard,
    iceTiles: [{ row: 2, column: 1 }, { row: 2, column: 2 }],
    teleports: [{
      id: "ice-exit",
      entry: { row: 2, column: 3 },
      exit: { row: 0, column: 5 },
    }],
  };
  const next = moveGame(
    createInitialGameState(iceTeleportBoard),
    "right",
    iceTeleportBoard,
  );

  assert.deepEqual(next.worm, [{ row: 0, column: 5 }]);
  assert.equal(next.moves, 1);
  assert.equal(next.status, "playing");
});

test("moving obstacles advance once per direction action during an ice slide", () => {
  const iceWithMovingObstacle = {
    ...iceBoard,
    movingObstacles: [{
      id: "crossing-patroller",
      path: [{ row: 0, column: 0 }, { row: 2, column: 2 }],
    }],
  };
  const initial = createInitialGameState(iceWithMovingObstacle);
  const next = moveGame(initial, "right", iceWithMovingObstacle);

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, [{ row: 2, column: 1 }]);
  assert.deepEqual(
    getMovingObstaclePositions(iceWithMovingObstacle, next.moves),
    [{ id: "crossing-patroller", row: 2, column: 2 }],
  );
});

test("a wall stops an ice slide at the last in-bounds cell without losing", () => {
  const edgeIceBoard = {
    rows: 5,
    columns: 5,
    worm: [{ row: 2, column: 2 }],
    apples: [],
    obstacles: [],
    portal: { row: 4, column: 4 },
    iceTiles: [{ row: 2, column: 3 }, { row: 2, column: 4 }],
  };
  const next = moveGame(createInitialGameState(edgeIceBoard), "right", edgeIceBoard);

  assert.equal(next.status, "playing");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, [{ row: 2, column: 4 }]);
});

test("a worm-body collision during a slide preserves prior safe slide steps", () => {
  const bodyCollisionBoard = {
    rows: 5,
    columns: 6,
    worm: [
      { row: 1, column: 3 },
      { row: 1, column: 2 },
      { row: 2, column: 2 },
      { row: 3, column: 2 },
      { row: 3, column: 1 },
      { row: 3, column: 0 },
      { row: 2, column: 0 },
    ],
    apples: [],
    obstacles: [],
    portal: { row: 4, column: 5 },
    iceTiles: [{ row: 2, column: 1 }],
  };
  const initial = createInitialGameState(bodyCollisionBoard);
  const next = moveGame(initial, "right", bodyCollisionBoard);

  assert.equal(next.status, "lost");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm.at(-1), { row: 2, column: 1 });
  assert.equal(next.worm.length, initial.worm.length);
});

test("sliding onto the goal portal wins and ends the direction action", () => {
  const iceGoalBoard = {
    rows: 5,
    columns: 5,
    worm: [{ row: 2, column: 0 }],
    apples: [],
    obstacles: [],
    portal: { row: 2, column: 4 },
    iceTiles: [
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 2, column: 3 },
    ],
  };
  const next = moveGame(createInitialGameState(iceGoalBoard), "right", iceGoalBoard);

  assert.equal(next.status, "won");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, [{ row: 2, column: 4 }]);
});

test("a long connected ice strip terminates at the board edge within one action", () => {
  const longIceBoard = {
    rows: 5,
    columns: 7,
    worm: [{ row: 2, column: 0 }],
    apples: [],
    obstacles: [],
    portal: { row: 4, column: 6 },
    iceTiles: Array.from({ length: 6 }, (_, index) => ({
      row: 2,
      column: index + 1,
    })),
  };
  const next = moveGame(createInitialGameState(longIceBoard), "right", longIceBoard);

  assert.equal(next.status, "playing");
  assert.equal(next.moves, 1);
  assert.deepEqual(next.worm, [{ row: 2, column: 6 }]);
});

test("validates ice tile bounds, unique positions, and incompatible overlaps", () => {
  assert.equal(validateIceTileBoard(iceBoard), true);
  const invalidBoards = [
    { ...iceBoard, iceTiles: [{ row: -1, column: 1 }] },
    { ...iceBoard, iceTiles: [{ row: 2, column: 7 }] },
    { ...iceBoard, iceTiles: [{ row: 2, column: 1.5 }] },
    {
      ...iceBoard,
      iceTiles: [{ row: 2, column: 1 }, { row: 2, column: 1 }],
    },
    { ...iceBoard, iceTiles: [{ row: 2, column: 0 }] },
    {
      ...iceBoard,
      obstacles: [{ row: 1, column: 1 }],
      iceTiles: [{ row: 1, column: 1 }],
    },
    { ...iceBoard, iceTiles: [{ row: 4, column: 6 }] },
    {
      ...iceBoard,
      teleports: [{
        id: "pair",
        entry: { row: 2, column: 1 },
        exit: { row: 0, column: 0 },
      }],
    },
  ];

  for (const invalidBoard of invalidBoards) {
    assert.throws(() => createInitialGameState(invalidBoard));
  }
});

test("ice replay is deterministic and hints are unavailable", () => {
  const actions = ["right"];
  const first = replayGameActions(iceBoard, actions);
  const second = replayGameActions(iceBoard, actions);

  assert.deepEqual(first, second);
  assert.equal(first.moves, 1);
  assert.equal(findHint(createInitialGameState(iceBoard), iceBoard), null);
});

test("levels without a move limit retain unlimited movement behavior", () => {
  const unlimitedBoard = {
    rows: 5,
    columns: 5,
    worm: [{ row: 2, column: 2 }],
    apples: [],
    obstacles: [],
    portal: { row: 4, column: 4 },
  };
  let state = createInitialGameState(unlimitedBoard);
  for (const direction of ["up", "right", "down", "left", "up", "right"]) {
    state = moveGame(state, direction, unlimitedBoard);
  }

  assert.equal(state.moves, 6);
  assert.equal(state.status, "playing");
  assert.equal(Object.hasOwn(state, "failureReason"), false);
  assert.equal(isChallengeLevel({ number: 1 }), false);
});

test("counts each accepted direction action once and ignores invalid or out-of-bounds moves", () => {
  const challengeBoard = {
    rows: 4,
    columns: 4,
    worm: [{ row: 0, column: 1 }],
    apples: [],
    obstacles: [],
    portal: { row: 3, column: 3 },
  };
  const initial = createInitialGameState(challengeBoard, 3);

  assert.equal(moveGame(initial, "diagonal", challengeBoard, 3), initial);
  assert.equal(moveGame(initial, "up", challengeBoard, 3), initial);
  const firstMove = moveGame(initial, "right", challengeBoard, 3);
  assert.equal(firstMove.moves, 1);
  assert.equal(firstMove.status, "playing");
});

test("ice slides and teleport traversal each count as one limited action", () => {
  const iceState = moveGame(createInitialGameState(iceBoard, 2), "right", iceBoard, 2);
  assert.equal(iceState.moves, 1);
  assert.equal(iceState.status, "playing");

  const teleportState = moveGame(
    createInitialGameState(teleportBoard, 2),
    "right",
    teleportBoard,
    2,
  );
  assert.equal(teleportState.moves, 1);
  assert.equal(teleportState.status, "playing");
  assert.deepEqual(teleportState.worm.at(-1), { row: 1, column: 5 });
});

test("winning on the final allowed move takes precedence over move-limit failure", () => {
  const finalMoveBoard = {
    rows: 4,
    columns: 4,
    worm: [{ row: 2, column: 2 }],
    apples: [],
    obstacles: [],
    portal: { row: 2, column: 3 },
  };
  const initial = createInitialGameState(finalMoveBoard, 1);
  const won = moveGame(initial, "right", finalMoveBoard, 1);

  assert.equal(won.moves, 1);
  assert.equal(won.status, "won");
  assert.equal(Object.hasOwn(won, "failureReason"), false);
});

test("reaching the move limit without winning fails the challenge and blocks later moves", () => {
  const challengeBoard = {
    rows: 4,
    columns: 4,
    worm: [{ row: 1, column: 1 }],
    apples: [],
    obstacles: [],
    portal: { row: 3, column: 3 },
  };
  const initial = createInitialGameState(challengeBoard, 1);
  const failed = moveGame(initial, "right", challengeBoard, 1);
  const afterFailure = moveGame(failed, "down", challengeBoard, 1);

  assert.equal(failed.moves, 1);
  assert.equal(failed.status, "lost");
  assert.equal(failed.failureReason, "move-limit");
  assert.equal(afterFailure, failed);
});

test("identifies valid limited-move challenge metadata and rejects invalid limits", () => {
  assert.equal(isChallengeLevel({ moveLimit: 10 }), true);
  assert.equal(isChallengeLevel({ moveLimit: 0 }), false);
  assert.equal(isChallengeLevel({ moveLimit: 2.5 }), false);
  assert.equal(isChallengeLevel({}), false);

  for (const moveLimit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.throws(() => createInitialGameState(iceBoard, moveLimit));
  }
});

test("move-limit replay deterministically fails at the same accepted action", () => {
  const actions = ["right", "down", "down"];
  const first = replayGameActions(movingObstacleBoard, actions, 2);
  const second = replayGameActions(movingObstacleBoard, actions, 2);

  assert.deepEqual(first, second);
  assert.equal(first.moves, 2);
  assert.equal(first.status, "lost");
  assert.equal(first.failureReason, "move-limit");
});
