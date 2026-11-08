import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  createInitialGameState,
  moveGame,
  replayGameActions,
  replayGameActionsWithHistory,
} from "./gameLogic.js";
import { levels } from "./levelData.js";
import {
  FEATURE_REWARDS,
  getLevelFeatureBoard,
  validateLevelFeatureBoard,
} from "./levelFeatures.js";

function linearBoard(features = {}) {
  return {
    rows: 1,
    columns: 7,
    worm: [{ row: 0, column: 0 }],
    apples: [],
    obstacles: [],
    portal: { row: 0, column: 6 },
    ...features,
  };
}

function moveRight(state, board) {
  return moveGame(state, "right", board);
}

function originalRoute(level) {
  const { rows, columns } = level.board;
  const route = [];
  let direction = 1;
  for (let row = 0; row < rows; row += 2) {
    if (direction === 1) {
      for (let column = 0; column < columns; column += 1) {
        route.push({ row, column });
      }
    } else {
      for (let column = columns - 1; column >= 0; column -= 1) {
        route.push({ row, column });
      }
    }
    if (row + 1 < rows) {
      route.push({ row: row + 1, column: direction === 1 ? columns - 1 : 0 });
    }
    direction *= -1;
  }
  return route;
}

test("keeps all 100 base level definitions byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(JSON.stringify(levels)).digest("hex"),
    "7c4e35eefa63bab7a110f1aa32a31bc7d8ce08d40f92d801c241683f8064c27c",
  );
});

test("feature boards are deterministic, validated, and leave the base definitions untouched", () => {
  for (const level of levels) {
    const board = getLevelFeatureBoard(level);
    assert.deepEqual(board, getLevelFeatureBoard(level));
    if (
      board.goldenApples ||
      board.treasures ||
      board.pressurePlates ||
      board.pressureGates ||
      board.disappearingBridges ||
      board.timedSwitches ||
      board.timedDoors ||
      board.rotatingSwitches ||
      board.rotatingBarriers
    ) {
      assert.equal(validateLevelFeatureBoard(board), true);
    }
  }
  assert.equal(Object.hasOwn(levels[15].board, "pressurePlates"), false);
  assert.equal(Object.hasOwn(levels[35].board, "disappearingBridges"), false);
});

test("all feature-enabled levels remain solvable on their original route", () => {
  for (const level of levels) {
    const board = getLevelFeatureBoard(level);
    let game = createInitialGameState(board);
    const route = originalRoute(level);
    const actions = [];

    for (let index = board.worm.length; index < route.length; index += 1) {
      const previous = route[index - 1];
      const next = route[index];
      const direction = next.row < previous.row
        ? "up"
        : next.row > previous.row
          ? "down"
          : next.column < previous.column
            ? "left"
            : "right";
      actions.push(direction);
      game = moveGame(game, direction, board);
      assert.notEqual(game.status, "lost", `${level.name} original route`);
    }
    assert.equal(game.status, "won", `${level.name} original route`);
    const replayed = replayGameActions(board, actions);
    assert.deepEqual(
      { ...replayed, canUndo: game.canUndo },
      game,
      `${level.name} replay must match direct play`,
    );
  }
});

test("configured bonus collectibles are reachable using the shared game rules", () => {
  const directions = ["up", "down", "left", "right"];
  for (const level of levels) {
    const board = getLevelFeatureBoard(level);
    const targets = [...(board.goldenApples ?? []), ...(board.treasures ?? [])];
    for (const target of targets) {
      const initial = createInitialGameState(board);
      const stateKey = (state) => JSON.stringify([
        state.moves,
        state.worm,
        state.apples,
        state.collectedGoldenAppleIds ?? [],
        state.collectedTreasureIds ?? [],
      ]);
      const queue = [initial];
      const visited = new Set([stateKey(initial)]);
      let found = false;

      for (let index = 0; index < queue.length && index < 50000; index += 1) {
        const state = queue[index];
        if (
            state.collectedGoldenAppleIds?.includes(target.id) ||
            state.collectedTreasureIds?.includes(target.id)
        ) {
            found = true;
            break;
        }
        if (!["ready", "playing"].includes(state.status)) continue;
        for (const direction of directions) {
            const next = moveGame(state, direction, board);
            if (next === state || next.status === "lost") continue;
            const key = stateKey(next);
            if (visited.has(key)) continue;
            visited.add(key);
            queue.push(next);
        }
      }

      assert.equal(found, true, `Level ${level.number} ${target.id} must be reachable`);
    }
  }
});

test("golden apples and treasures are collectible without affecting normal score", () => {
  const board = linearBoard({
    goldenApples: [{
      id: "gold",
      row: 0,
      column: 1,
      reward: FEATURE_REWARDS.goldenApple,
    }],
    treasures: [{
      id: "chest",
      row: 0,
      column: 2,
      reward: FEATURE_REWARDS.treasure,
    }],
  });
  let game = createInitialGameState(board);
  game = moveRight(game, board);
  assert.deepEqual(game.collectedGoldenAppleIds, ["gold"]);
  assert.equal(game.score, 0);
  game = moveRight(game, board);
  assert.deepEqual(game.collectedTreasureIds, ["chest"]);
  assert.equal(game.score, 0);
});

test("pressure plates open only their connected gates", () => {
  const board = linearBoard({
    pressurePlates: [{
      id: "plate",
      row: 0,
      column: 1,
      opensGateIds: ["gate"],
    }],
    pressureGates: [{
      id: "gate",
      row: 0,
      column: 2,
      plateId: "plate",
    }],
  });
  let game = createInitialGameState(board);
  game = moveRight(game, board);
  assert.deepEqual(game.activatedPressurePlateIds, ["plate"]);
  game = moveRight(game, board);
  assert.deepEqual(game.openedPressureGateIds, ["gate"]);
  assert.equal(game.status, "playing");
});

test("disappearing bridges collapse after the configured accepted moves", () => {
  const board = linearBoard({
    disappearingBridges: [{
      id: "bridge",
      row: 0,
      column: 1,
      collapseAfterMoves: 1,
    }],
  });
  let game = moveRight(createInitialGameState(board), board);
  assert.deepEqual(game.collapsedBridgeIds, []);
  game = moveRight(game, board);
  assert.deepEqual(game.collapsedBridgeIds, ["bridge"]);
  game = moveGame(game, "left", board);
  assert.equal(game.status, "lost");
  assert.equal(game.moves, 3);
});

test("timed switches expose a deterministic door countdown", () => {
  const board = linearBoard({
    timedSwitches: [{
      id: "switch",
      row: 0,
      column: 1,
      durationMoves: 2,
      doorIds: ["door"],
    }],
    timedDoors: [{
      id: "door",
      row: 0,
      column: 3,
      switchId: "switch",
    }],
  });
  let game = createInitialGameState(board);
  game = moveRight(game, board);
  game = moveRight(game, board);
  game = moveRight(game, board);
  assert.equal(game.status, "playing");
  assert.equal(game.timedDoorExpiry.door, 3);

  const expiredBoard = {
    ...board,
    timedSwitches: [{ ...board.timedSwitches[0], durationMoves: 1 }],
  };
  let expired = createInitialGameState(expiredBoard);
  expired = moveRight(expired, expiredBoard);
  expired = moveRight(expired, expiredBoard);
  expired = moveRight(expired, expiredBoard);
  assert.equal(expired.status, "lost");
});

test("rotating barriers switch orientation and block the configured axis", () => {
  const board = linearBoard({
    rotatingSwitches: [{
      id: "switch",
      row: 0,
      column: 1,
      barrierIds: ["barrier"],
    }],
    rotatingBarriers: [{
      id: "barrier",
      row: 0,
      column: 3,
      initialOrientation: "vertical",
    }],
  });
  let game = createInitialGameState(board);
  game = moveRight(game, board);
  assert.equal(game.rotatingBarrierOrientations.barrier, "horizontal");
  game = moveRight(game, board);
  game = moveRight(game, board);
  assert.equal(game.status, "playing");

  const closedBoard = {
    ...board,
    rotatingSwitches: [{ ...board.rotatingSwitches[0], column: 4 }],
  };
  let blocked = createInitialGameState(closedBoard);
  blocked = moveRight(blocked, closedBoard);
  blocked = moveRight(blocked, closedBoard);
  blocked = moveRight(blocked, closedBoard);
  assert.equal(blocked.status, "lost");
});

test("undo restores collectible and mechanic state and replays deterministically", () => {
  const cases = [
    {
      board: linearBoard({
        goldenApples: [{ id: "gold", row: 0, column: 1, reward: FEATURE_REWARDS.goldenApple }],
      }),
      verify: (state) => assert.deepEqual(state.collectedGoldenAppleIds, ["gold"]),
    },
    {
      board: linearBoard({
        treasures: [{ id: "chest", row: 0, column: 1, reward: FEATURE_REWARDS.treasure }],
      }),
      verify: (state) => assert.deepEqual(state.collectedTreasureIds, ["chest"]),
    },
    {
      board: linearBoard({
        pressurePlates: [{ id: "plate", row: 0, column: 1, opensGateIds: ["gate"] }],
        pressureGates: [{ id: "gate", row: 0, column: 2, plateId: "plate" }],
      }),
      verify: (state) => assert.deepEqual(state.openedPressureGateIds, ["gate"]),
    },
    {
      board: linearBoard({
        disappearingBridges: [{ id: "bridge", row: 0, column: 1, collapseAfterMoves: 1 }],
      }),
      verify: (state) => assert.equal(state.bridgeCollapseAtMoves.bridge, 2),
    },
    {
      board: linearBoard({
        timedSwitches: [{ id: "switch", row: 0, column: 1, durationMoves: 2, doorIds: ["door"] }],
        timedDoors: [{ id: "door", row: 0, column: 2, switchId: "switch" }],
      }),
      verify: (state) => assert.equal(state.timedDoorExpiry.door, 3),
    },
    {
      board: linearBoard({
        rotatingSwitches: [{ id: "switch", row: 0, column: 1, barrierIds: ["barrier"] }],
        rotatingBarriers: [{ id: "barrier", row: 0, column: 3, initialOrientation: "vertical" }],
      }),
      verify: (state) => assert.equal(state.rotatingBarrierOrientations.barrier, "horizontal"),
    },
  ];

  for (const { board, verify } of cases) {
    const initial = createInitialGameState(board);
    const moved = replayGameActions(board, ["right"]);
    verify(moved);
    const undone = replayGameActionsWithHistory(board, ["right", "booster:undo"]);
    assert.deepEqual(undone.state, initial);
    assert.deepEqual(replayGameActions(board, ["right"]), moved);
  }
});

test("a feature board can win on its final allowed move", () => {
  const board = {
    ...linearBoard({
      timedSwitches: [{
        id: "switch",
        row: 0,
        column: 1,
        durationMoves: 2,
        doorIds: ["door"],
      }],
      timedDoors: [{ id: "door", row: 0, column: 2, switchId: "switch" }],
    }),
    columns: 4,
    portal: { row: 0, column: 3 },
  };
  const game = replayGameActions(board, ["right", "right", "right"], 3);
  assert.equal(game.status, "won");
  assert.equal(game.moves, 3);
});

test("rejects malformed or disconnected mechanic definitions", () => {
  assert.throws(() => validateLevelFeatureBoard(linearBoard({
    pressureGates: [{
      id: "gate",
      row: 0,
      column: 2,
      plateId: "missing",
    }],
  })), /existing pressure plate/);
  assert.throws(() => validateLevelFeatureBoard(linearBoard({
    disappearingBridges: [{
      id: "bridge",
      row: 0,
      column: 1,
      collapseAfterMoves: 0,
    }],
  })), /positive collapse delay/);
});
