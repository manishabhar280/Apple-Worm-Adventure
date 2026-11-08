import { BOOSTER_CATALOG, BOOSTER_ACTIONS } from "./boosterCatalog.js";
import { validateLevelFeatureBoard } from "./levelFeatures.js";

export const DIRECTIONS = {
  up: { row: -1, column: 0 },
  down: { row: 1, column: 0 },
  left: { row: 0, column: -1 },
  right: { row: 0, column: 1 },
};

const samePosition = (first, second) =>
  first.row === second.row && first.column === second.column;

export function isChallengeLevel(level) {
  return Number.isSafeInteger(level?.moveLimit) && level.moveLimit > 0;
}

function validateMoveLimit(moveLimit) {
  if (
    moveLimit !== undefined &&
    (!Number.isSafeInteger(moveLimit) || moveLimit <= 0)
  ) {
    throw new Error("Move limit must be a positive safe integer when provided.");
  }
}

function positionKey(position) {
  return `${position.row}:${position.column}`;
}

function greatestCommonDivisor(first, second) {
  let a = first;
  let b = second;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function getMovingObstaclePositions(board, moveCount = 0) {
  if (!Number.isInteger(moveCount) || moveCount < 0) {
    throw new Error("Moving obstacle move count must be a non-negative integer.");
  }

  return (board.movingObstacles ?? []).map(({ id, path }) => ({
    id,
    ...path[moveCount % path.length],
  }));
}

export function validateMovingObstacleBoard(board) {
  const movingObstacles =
    board.movingObstacles === undefined ? [] : board.movingObstacles;
  if (!Array.isArray(movingObstacles)) {
    throw new Error("Board moving obstacles must be an array when provided.");
  }

  const ids = new Set();
  const incompatiblePositions = new Set([
    ...board.worm,
    ...board.apples,
    ...board.obstacles,
    board.portal,
    ...(board.keys ?? []),
    ...(board.gates ?? []),
    ...(board.teleports ?? []).flatMap(({ entry, exit }) => [entry, exit]),
  ].filter(Boolean).map(positionKey));
  const paths = [];

  for (const obstacle of movingObstacles) {
    if (
      !obstacle ||
      typeof obstacle.id !== "string" ||
      obstacle.id.trim().length === 0 ||
      ids.has(obstacle.id)
    ) {
      throw new Error("Moving obstacles must have unique non-empty ids.");
    }
    if (!Array.isArray(obstacle.path) || obstacle.path.length < 2) {
      throw new Error("Moving obstacle paths must contain at least two positions.");
    }

    const pathPositions = new Set();
    for (const position of obstacle.path) {
      if (
        !position ||
        !Number.isInteger(position.row) ||
        !Number.isInteger(position.column) ||
        position.row < 0 ||
        position.row >= board.rows ||
        position.column < 0 ||
        position.column >= board.columns
      ) {
        throw new Error("Moving obstacle coordinates must be within the board.");
      }

      const key = positionKey(position);
      if (pathPositions.has(key)) {
        throw new Error("Moving obstacle paths cannot repeat positions.");
      }
      if (incompatiblePositions.has(key)) {
        throw new Error("Moving obstacles cannot overlap incompatible tiles.");
      }
      pathPositions.add(key);
    }

    ids.add(obstacle.id);
    paths.push(obstacle.path);
  }

  for (let firstIndex = 0; firstIndex < paths.length; firstIndex += 1) {
    const firstPath = paths[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex += 1) {
      const secondPath = paths[secondIndex];
      const phasePeriod = greatestCommonDivisor(firstPath.length, secondPath.length);
      for (let firstStep = 0; firstStep < firstPath.length; firstStep += 1) {
        for (let secondStep = 0; secondStep < secondPath.length; secondStep += 1) {
          if (
            samePosition(firstPath[firstStep], secondPath[secondStep]) &&
            (firstStep - secondStep) % phasePeriod === 0
          ) {
            throw new Error("Moving obstacles cannot occupy the same cell on the same move.");
          }
        }
      }
    }
  }

  return true;
}

export function validateKeyGateBoard(board) {
  const keys = board.keys === undefined ? [] : board.keys;
  const gates = board.gates === undefined ? [] : board.gates;
  if (!Array.isArray(keys) || !Array.isArray(gates)) {
    throw new Error("Board keys and gates must be arrays when provided.");
  }

  const keyIds = new Set();
  const tileIds = new Set();
  const mechanicPositions = new Set();
  const incompatiblePositions = new Set([
    ...board.worm,
    ...board.apples,
    ...board.obstacles,
    board.portal,
  ].filter(Boolean).map(positionKey));

  function validateTile(tile, type) {
    if (
      !tile ||
      typeof tile.id !== "string" ||
      tile.id.trim().length === 0 ||
      tileIds.has(tile.id)
    ) {
      throw new Error(`Board ${type} must have a unique non-empty id.`);
    }
    if (
      !Number.isInteger(tile.row) ||
      !Number.isInteger(tile.column) ||
      tile.row < 0 ||
      tile.row >= board.rows ||
      tile.column < 0 ||
      tile.column >= board.columns
    ) {
      throw new Error(`Board ${type} coordinates must be within the board.`);
    }

    const key = positionKey(tile);
    if (incompatiblePositions.has(key) || mechanicPositions.has(key)) {
      throw new Error(`Board ${type} cannot overlap another tile.`);
    }
    tileIds.add(tile.id);
    mechanicPositions.add(key);
  }

  for (const key of keys) {
    validateTile(key, "keys");
    keyIds.add(key.id);
  }
  for (const gate of gates) {
    validateTile(gate, "gates");
    if (typeof gate.keyId !== "string" || !keyIds.has(gate.keyId)) {
      throw new Error(`Board gate "${gate.id}" must reference a valid key.`);
    }
  }

  return true;
}

export function validateIceTileBoard(board) {
  const iceTiles = board.iceTiles === undefined ? [] : board.iceTiles;
  if (!Array.isArray(iceTiles)) {
    throw new Error("Board ice tiles must be an array when provided.");
  }

  const positions = new Set();
  const incompatiblePositions = new Set([
    ...board.worm,
    ...board.obstacles,
    board.portal,
  ].filter(Boolean).map(positionKey));

  for (const tile of iceTiles) {
    if (
      !tile ||
      !Number.isInteger(tile.row) ||
      !Number.isInteger(tile.column) ||
      tile.row < 0 ||
      tile.row >= board.rows ||
      tile.column < 0 ||
      tile.column >= board.columns
    ) {
      throw new Error("Ice tile coordinates must be within the board.");
    }

    const key = positionKey(tile);
    if (positions.has(key)) {
      throw new Error("Ice tiles cannot contain duplicate positions.");
    }
    if (incompatiblePositions.has(key)) {
      throw new Error("Ice tiles cannot overlap the worm start, obstacles, or goal portal.");
    }
    positions.add(key);
  }

  return true;
}

export function validateTeleportBoard(board) {
  const teleports = board.teleports === undefined ? [] : board.teleports;
  if (
    !Array.isArray(teleports) ||
    (board.iceTiles !== undefined && !Array.isArray(board.iceTiles))
  ) {
    throw new Error("Board teleports and ice tiles must be arrays when provided.");
  }

  const ids = new Set();
  const endpoints = new Set();
  const incompatiblePositions = new Set([
    ...board.worm,
    ...board.apples,
    ...board.obstacles,
    board.portal,
    ...(board.keys ?? []),
    ...(board.gates ?? []),
    ...(board.iceTiles ?? []),
  ].filter(Boolean).map(positionKey));

  for (const teleport of teleports) {
    if (
      !teleport ||
      typeof teleport.id !== "string" ||
      teleport.id.trim().length === 0 ||
      ids.has(teleport.id)
    ) {
      throw new Error("Board teleports must have unique non-empty ids.");
    }

    const { entry, exit } = teleport;
    for (const endpoint of [entry, exit]) {
      if (
        !endpoint ||
        !Number.isInteger(endpoint.row) ||
        !Number.isInteger(endpoint.column) ||
        endpoint.row < 0 ||
        endpoint.row >= board.rows ||
        endpoint.column < 0 ||
        endpoint.column >= board.columns
      ) {
        throw new Error("Teleport endpoints must be within the board.");
      }
    }

    const entryKey = positionKey(entry);
    const exitKey = positionKey(exit);
    if (entryKey === exitKey) {
      throw new Error("Teleport entry and exit must be distinct.");
    }
    if (
      incompatiblePositions.has(entryKey) ||
      incompatiblePositions.has(exitKey) ||
      endpoints.has(entryKey) ||
      endpoints.has(exitKey)
    ) {
      throw new Error("Teleport endpoints cannot overlap another tile.");
    }

    ids.add(teleport.id);
    endpoints.add(entryKey);
    endpoints.add(exitKey);
  }

  return true;
}

export function createInitialGameState(board, moveLimit = board.moveLimit) {
  validateMoveLimit(moveLimit);
  const hasKeyGateMechanics =
    Object.hasOwn(board, "keys") || Object.hasOwn(board, "gates");
  const hasTeleportMechanics = Object.hasOwn(board, "teleports");
  const hasMovingObstacles = Object.hasOwn(board, "movingObstacles");
  const hasIceTiles = Object.hasOwn(board, "iceTiles");
  const hasLevelFeatures = [
    "goldenApples",
    "treasures",
    "pressurePlates",
    "pressureGates",
    "disappearingBridges",
    "timedSwitches",
    "timedDoors",
    "rotatingSwitches",
    "rotatingBarriers",
  ].some((feature) => Object.hasOwn(board, feature));
  if (hasLevelFeatures) validateLevelFeatureBoard(board);
  if (hasKeyGateMechanics || hasTeleportMechanics) {
    validateKeyGateBoard(board);
  }
  if (hasTeleportMechanics) validateTeleportBoard(board);
  if (hasIceTiles) validateIceTileBoard(board);
  if (hasMovingObstacles) validateMovingObstacleBoard(board);

  return {
    status: "ready",
    worm: board.worm.map((segment) => ({ ...segment })),
    apples: board.apples.map((apple) => ({ ...apple })),
    moves: 0,
    score: 0,
    canUndo: false,
    ...(hasKeyGateMechanics ? { collectedKeyIds: [] } : {}),
    ...(hasLevelFeatures
      ? {
          collectedGoldenAppleIds: [],
          collectedTreasureIds: [],
          activatedPressurePlateIds: [],
          openedPressureGateIds: [],
          bridgeCollapseAtMoves: {},
          collapsedBridgeIds: [],
          timedDoorExpiry: {},
          rotatingBarrierOrientations: {},
        }
      : {}),
  };
}

export function moveGame(state, direction, board, moveLimit = board.moveLimit) {
  validateMoveLimit(moveLimit);
  const delta = DIRECTIONS[direction];
  if (!delta || !["ready", "playing"].includes(state.status)) {
    return state;
  }

  const { rows, columns } = board;
  const isFrozen = (state.freezeActionsRemaining || 0) > 0;
  const movingObstacleTick = isFrozen
    ? state.frozenObstacleTick
    : state.moves + 1 - (state.movingObstacleOffset || 0);
  const nextMovingObstacles = getMovingObstaclePositions(board, movingObstacleTick);
  const maxSlideSteps = rows * columns;
  let nextState = state;
  let actionAccepted = false;

  for (let step = 0; step < maxSlideSteps; step += 1) {
    const head = nextState.worm[nextState.worm.length - 1];
    const nextHead = {
      row: head.row + delta.row,
      column: head.column + delta.column,
    };

    if (
      nextHead.row < 0 ||
      nextHead.row >= rows ||
      nextHead.column < 0 ||
      nextHead.column >= columns
    ) {
      break;
    }

    actionAccepted = true;
    const collectedApple = nextState.apples.some((apple) =>
      samePosition(apple, nextHead),
    );
    const gate = (board.gates ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const teleport = (board.teleports ?? []).find((item) =>
      samePosition(item.entry, nextHead),
    );
    const destination = teleport?.exit ?? nextHead;
    const collectedKeyIds = nextState.collectedKeyIds ?? [];
    const hitsLockedGate =
      gate && !collectedKeyIds.includes(gate.keyId);
    const pressureGate = (board.pressureGates ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const hitsClosedPressureGate = pressureGate &&
      !(nextState.openedPressureGateIds ?? []).includes(pressureGate.id);
    const timedDoor = (board.timedDoors ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const hitsClosedTimedDoor = timedDoor &&
      (nextState.timedDoorExpiry?.[timedDoor.id] ?? 0) < state.moves + 1;
    const bridge = (board.disappearingBridges ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const hitsCollapsedBridge = bridge &&
      (nextState.bridgeCollapseAtMoves?.[bridge.id] ?? Number.MAX_SAFE_INTEGER) <=
        state.moves + 1;
    const rotatingBarrier = (board.rotatingBarriers ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const barrierOrientation = rotatingBarrier
      ? nextState.rotatingBarrierOrientations?.[rotatingBarrier.id] ??
        rotatingBarrier.initialOrientation
      : null;
    const movementAxis = delta.row === 0 ? "horizontal" : "vertical";
    const hitsRotatingBarrier = rotatingBarrier &&
      (barrierOrientation === "vertical"
        ? movementAxis === "horizontal"
        : movementAxis === "vertical");
    const hitsObstacle = board.obstacles.some((obstacle) =>
      samePosition(obstacle, nextHead),
    );
    const bodyToCheck = collectedApple
      ? nextState.worm
      : nextState.worm.slice(1);
    const hitsWorm = bodyToCheck.some((segment) =>
      samePosition(segment, nextHead),
    );
    const hitsTeleportExitObstacle =
      teleport && board.obstacles.some((obstacle) =>
        samePosition(obstacle, destination),
      );
    const hitsTeleportExitWorm =
      teleport && bodyToCheck.some((segment) =>
        samePosition(segment, destination),
      );
    const worm = collectedApple
      ? [...nextState.worm, destination]
      : [...nextState.worm.slice(1), destination];
    const hitsMovingObstacle = nextMovingObstacles.some((obstacle) =>
      samePosition(obstacle, nextHead) ||
      worm.some((segment) => samePosition(segment, obstacle)),
    );

    const collision =
      hitsObstacle ||
      hitsWorm ||
      hitsLockedGate ||
      hitsClosedPressureGate ||
      hitsClosedTimedDoor ||
      hitsCollapsedBridge ||
      hitsRotatingBarrier ||
      hitsTeleportExitObstacle ||
      hitsTeleportExitWorm ||
      hitsMovingObstacle;

    if (collision && state.shieldActive) {
      nextState = {
        ...nextState,
        status: nextState.status === "ready" ? "playing" : nextState.status,
        shieldActive: false,
        shieldConsumed: true,
      };
      break;
    }

    if (collision) {
      return {
        ...nextState,
        status: "lost",
        moves: state.moves + 1,
        ...(isFrozen
          ? {
              freezeActionsRemaining: Math.max(0, state.freezeActionsRemaining - 1),
              movingObstacleOffset: state.movingObstacleOffset || 0,
            }
          : {}),
      };
    }

    const apples = collectedApple
      ? nextState.apples.filter((apple) => !samePosition(apple, nextHead))
      : nextState.apples;
    const goldenApple = (board.goldenApples ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const treasure = (board.treasures ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const pressurePlate = (board.pressurePlates ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const timedSwitch = (board.timedSwitches ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const rotatingSwitch = (board.rotatingSwitches ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const collectedGoldenAppleIds = goldenApple &&
      !nextState.collectedGoldenAppleIds?.includes(goldenApple.id)
      ? [...(nextState.collectedGoldenAppleIds ?? []), goldenApple.id]
      : nextState.collectedGoldenAppleIds;
    const collectedTreasureIds = treasure &&
      !nextState.collectedTreasureIds?.includes(treasure.id)
      ? [...(nextState.collectedTreasureIds ?? []), treasure.id]
      : nextState.collectedTreasureIds;
    const activatedPressurePlateIds = pressurePlate &&
      !nextState.activatedPressurePlateIds?.includes(pressurePlate.id)
      ? [...(nextState.activatedPressurePlateIds ?? []), pressurePlate.id]
      : nextState.activatedPressurePlateIds;
    const openedPressureGateIds = pressurePlate
      ? [...new Set([
          ...(nextState.openedPressureGateIds ?? []),
          ...pressurePlate.opensGateIds,
        ])]
      : nextState.openedPressureGateIds;
    const bridgeCollapseAtMoves = bridge &&
      !Object.hasOwn(nextState.bridgeCollapseAtMoves ?? {}, bridge.id)
      ? {
          ...(nextState.bridgeCollapseAtMoves ?? {}),
          [bridge.id]: state.moves + 1 + bridge.collapseAfterMoves,
        }
      : nextState.bridgeCollapseAtMoves;
    const timedDoorExpiry = timedSwitch
      ? {
          ...(nextState.timedDoorExpiry ?? {}),
          ...Object.fromEntries(timedSwitch.doorIds.map((doorId) => [
            doorId,
            state.moves + 1 + timedSwitch.durationMoves,
          ])),
        }
      : nextState.timedDoorExpiry;
    const rotatingBarrierOrientations = rotatingSwitch
      ? {
          ...(nextState.rotatingBarrierOrientations ?? {}),
          ...Object.fromEntries(rotatingSwitch.barrierIds.map((barrierId) => {
            const barrier = board.rotatingBarriers.find(({ id }) => id === barrierId);
            const orientation = nextState.rotatingBarrierOrientations?.[barrierId] ??
              barrier.initialOrientation;
            return [barrierId, orientation === "vertical" ? "horizontal" : "vertical"];
          })),
        }
      : nextState.rotatingBarrierOrientations;
    const key = (board.keys ?? []).find((item) =>
      samePosition(item, nextHead),
    );
    const nextCollectedKeyIds = key && !collectedKeyIds.includes(key.id)
      ? [...collectedKeyIds, key.id]
      : collectedKeyIds;
    const reachedPortal = samePosition(board.portal, destination);
    nextState = {
      ...nextState,
      status: reachedPortal && apples.length === 0 ? "won" : "playing",
      worm,
      apples,
      score: nextState.score + (collectedApple ? 100 : 0),
      ...(Object.hasOwn(nextState, "collectedKeyIds")
        ? { collectedKeyIds: nextCollectedKeyIds }
        : {}),
      ...(Object.hasOwn(nextState, "collectedGoldenAppleIds")
        ? {
            collectedGoldenAppleIds,
            collectedTreasureIds,
            activatedPressurePlateIds,
            openedPressureGateIds,
            bridgeCollapseAtMoves,
            timedDoorExpiry,
            rotatingBarrierOrientations,
          }
        : {}),
    };

    if (
      nextState.status === "won" ||
      !(board.iceTiles ?? []).some((tile) => samePosition(tile, destination))
    ) {
      break;
    }
  }

  if (!actionAccepted) return state;

  const moves = state.moves + 1;
  const nextMoveLimit = moveLimit === undefined
    ? undefined
    : moveLimit + (state.extraMovesAdded || 0);
  const nextMovingObstacleOffset = isFrozen
    ? state.movingObstacleOffset || 0
    : state.movingObstacleOffset || 0;
  const timedState = {
    ...nextState,
    moves,
    ...(Object.hasOwn(nextState, "bridgeCollapseAtMoves")
      ? {
          collapsedBridgeIds: (board.disappearingBridges ?? [])
            .filter(({ id }) =>
              nextState.bridgeCollapseAtMoves[id] !== undefined &&
              nextState.bridgeCollapseAtMoves[id] <= moves)
            .map(({ id }) => id),
        }
      : {}),
    ...(isFrozen
      ? {
          freezeActionsRemaining: Math.max(0, state.freezeActionsRemaining - 1),
          frozenObstacleTick: state.frozenObstacleTick,
          movingObstacleOffset: nextMovingObstacleOffset,
        }
      : {}),
  };
  if (isFrozen && timedState.freezeActionsRemaining === 0) {
    timedState.movingObstacleOffset =
      moves - state.frozenObstacleTick;
  }
  if (timedState.status !== "won" && nextMoveLimit !== undefined && moves >= nextMoveLimit) {
    return {
      ...timedState,
      status: "lost",
      failureReason: "move-limit",
    };
  }
  return timedState;
}

export function togglePause(state) {
  if (state.status === "ready" || state.status === "playing") {
    return { ...state, status: "paused" };
  }
  if (state.status === "paused") {
    return { ...state, status: "playing" };
  }
  return state;
}

export function applyGameAction(
  state,
  action,
  board,
  moveLimit,
  history,
  { strict = false } = {},
) {
  if (DIRECTIONS[action]) {
    if (!["ready", "playing"].includes(state.status)) {
      if (strict) throw new Error("Actions cannot continue after a game has ended.");
      return state;
    }
    const nextState = moveGame(state, action, board, moveLimit);
    if (nextState.moves === state.moves) {
      if (strict) throw new Error("Every saved direction must make one valid grid move.");
      return state;
    }
    history.push(state);
    return { ...nextState, canUndo: true };
  }
  if (!BOOSTER_ACTIONS.includes(action)) {
    throw new Error("The action is not supported.");
  }
  if (!["ready", "playing"].includes(state.status)) {
    throw new Error("Boosters cannot be activated after a game has ended.");
  }

  const boosterId = action.slice("booster:".length);
  const booster = BOOSTER_CATALOG[boosterId];
  if (boosterId === "undo") {
    if (history.length === 0) throw new Error("Undo requires a previous accepted move.");
    state = history.pop();
  } else if (boosterId === "shield") {
    if (state.shieldActive) throw new Error("A shield is already active.");
    state = { ...state, shieldActive: true, shieldConsumed: false };
  } else if (boosterId === "extra_moves") {
    if (
      moveLimit === undefined ||
      (state.extraMovesUsed || 0) >= booster.maxUsesPerLevel
    ) {
      throw new Error("Extra Moves cannot be used on this level or exceed its cap.");
    }
    state = {
      ...state,
      extraMovesAdded: (state.extraMovesAdded || 0) + booster.amount,
      extraMovesUsed: (state.extraMovesUsed || 0) + 1,
    };
  } else if (boosterId === "freeze") {
    if (!(board.movingObstacles?.length)) {
      throw new Error("Freeze requires moving obstacles on the board.");
    }
    if ((state.freezeActionsRemaining || 0) > 0) {
      throw new Error("Moving obstacles are already frozen.");
    }
    state = {
      ...state,
      freezeActionsRemaining: booster.duration,
      frozenObstacleTick: state.moves - (state.movingObstacleOffset || 0),
    };
  } else if (boosterId === "hint") {
    if (!findHint(state, board, moveLimit)) {
      throw new Error("No valid hint is available for this game state.");
    }
  }
  return { ...state, canUndo: history.length > 0 };
}

export function replayGameActionsWithHistory(
  board,
  actions,
  moveLimit = board.moveLimit,
  options,
) {
  let state = createInitialGameState(board, moveLimit);
  const history = [];
  for (const action of actions) {
    state = applyGameAction(state, action, board, moveLimit, history, options);
  }
  return { state, history };
}

export function replayGameActions(board, actions, moveLimit = board.moveLimit, options) {
  return replayGameActionsWithHistory(board, actions, moveLimit, options).state;
}

function findPath(start, goal, board, worm) {
  const obstacleKeys = new Set(
    board.obstacles.map(({ row, column }) => `${row}:${column}`),
  );
  const bodyKeys = new Set(
    worm.slice(0, -1).map(({ row, column }) => `${row}:${column}`),
  );
  const queue = [{ ...start, firstDirection: null }];
  const visited = new Set([`${start.row}:${start.column}`]);
  const directions = Object.entries(DIRECTIONS);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (samePosition(current, goal)) return current.firstDirection;
    for (const [direction, delta] of directions) {
      const next = {
        row: current.row + delta.row,
        column: current.column + delta.column,
      };
      const key = `${next.row}:${next.column}`;
      if (
        next.row < 0 ||
        next.row >= board.rows ||
        next.column < 0 ||
        next.column >= board.columns ||
        obstacleKeys.has(key) ||
        bodyKeys.has(key) ||
        visited.has(key)
      ) continue;
      visited.add(key);
      queue.push({
        ...next,
        firstDirection: current.firstDirection ?? direction,
      });
    }
  }
  return null;
}

export function findHint(state, board, moveLimit = board.moveLimit) {
  validateMoveLimit(moveLimit);
  if (!["ready", "playing"].includes(state.status)) return null;
  if (
    board.keys?.length ||
    board.gates?.length ||
    board.teleports?.length ||
    board.movingObstacles?.length ||
    board.iceTiles?.length ||
    board.pressurePlates?.length ||
    board.pressureGates?.length ||
    board.disappearingBridges?.length ||
    board.timedSwitches?.length ||
    board.timedDoors?.length ||
    board.rotatingSwitches?.length ||
    board.rotatingBarriers?.length ||
    moveLimit !== undefined
  ) return null;
  const head = state.worm[state.worm.length - 1];
  const targets = state.apples.length > 0 ? state.apples : [board.portal];
  return targets
    .map((target) => findPath(head, target, board, state.worm))
    .find(Boolean) || null;
}
