import { levels } from "./levelData.js";

export const FEATURE_REWARDS = Object.freeze({
  goldenApple: 15,
  treasure: 25,
  efficientCompletion: 10,
  dailyChallenge: 20,
});

const goldenAppleLevels = new Set([5, 15, 25, 35, 45, 55, 65, 75, 85, 95]);
const treasureLevels = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

function createRoute(rows, columns) {
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

function positionKey({ row, column }) {
  return `${row}:${column}`;
}

function chooseSideCell(level, preferredRouteIndex, used) {
  const { board } = level;
  const route = createRoute(board.rows, board.columns);
  const routeIndexByPosition = new Map(
    route.map((position, index) => [positionKey(position), index]),
  );
  const occupied = new Set([
    ...board.worm,
    ...board.apples,
    ...board.obstacles,
    board.portal,
  ].map(positionKey));
  const cells = [];

  for (let row = 0; row < board.rows; row += 1) {
    for (let column = 0; column < board.columns; column += 1) {
      const position = { row, column };
      const key = positionKey(position);
      if (routeIndexByPosition.has(key) || occupied.has(key) || used.has(key)) continue;
      const adjacentPathIndex = route.findIndex((pathCell) =>
        Math.abs(pathCell.row - row) + Math.abs(pathCell.column - column) === 1,
      );
      if (adjacentPathIndex >= 3) {
        cells.push({ ...position, pathDistance: Math.abs(adjacentPathIndex - preferredRouteIndex) });
      }
    }
  }

  cells.sort((first, second) =>
    first.pathDistance - second.pathDistance ||
    first.row - second.row ||
    first.column - second.column);
  const { pathDistance, ...selected } = cells[0] ?? {};
  if (!selected || Object.keys(selected).length === 0) {
    throw new Error(`Level ${level.number} has no safe side cell for a collectible.`);
  }
  return selected;
}

function getMechanicFeatures(level) {
  const route = createRoute(level.board.rows, level.board.columns);
  const positionAt = (index) => route[index];

  switch (level.number) {
    case 16:
      return {
        pressurePlates: [{ id: "plate-16", ...positionAt(3), opensGateIds: ["gate-16"] }],
        pressureGates: [{ id: "gate-16", ...positionAt(5), plateId: "plate-16" }],
      };
    case 36:
      return {
        disappearingBridges: [{
          id: "bridge-36",
          ...positionAt(3),
          collapseAfterMoves: 1,
        }],
      };
    case 56:
      return {
        timedSwitches: [{
          id: "switch-56",
          ...positionAt(3),
          durationMoves: 4,
          doorIds: ["door-56"],
        }],
        timedDoors: [{ id: "door-56", ...positionAt(5), switchId: "switch-56" }],
      };
    case 76:
      return {
        rotatingSwitches: [{
          id: "switch-76",
          ...positionAt(3),
          barrierIds: ["barrier-76"],
        }],
        rotatingBarriers: [{
          id: "barrier-76",
          ...positionAt(5),
          initialOrientation: "vertical",
        }],
      };
    default:
      return {};
  }
}

export function getLevelFeatureBoard(level) {
  if (!level?.board) throw new Error("A complete level definition is required.");
  const used = new Set();
  const features = getMechanicFeatures(level);

  if (goldenAppleLevels.has(level.number)) {
    const position = chooseSideCell(level, 10, used);
    used.add(positionKey(position));
    features.goldenApples = [{
      id: `golden-${level.number}`,
      ...position,
      reward: FEATURE_REWARDS.goldenApple,
    }];
  }
  if (treasureLevels.has(level.number)) {
    const position = chooseSideCell(level, 16, used);
    features.treasures = [{
      id: `treasure-${level.number}`,
      ...position,
      reward: FEATURE_REWARDS.treasure,
    }];
  }

  return Object.keys(features).length === 0
    ? level.board
    : { ...level.board, ...features };
}

export function validateLevelFeatureBoard(board) {
  const listNames = [
    "goldenApples",
    "treasures",
    "pressurePlates",
    "pressureGates",
    "disappearingBridges",
    "timedSwitches",
    "timedDoors",
    "rotatingSwitches",
    "rotatingBarriers",
  ];
  const features = listNames.flatMap((name) => {
    const list = board[name] ?? [];
    if (!Array.isArray(list)) throw new Error(`Board ${name} must be an array.`);
    return list.map((item) => ({ ...item, featureType: name }));
  });
  if (features.length === 0) return true;

  const ids = new Set();
  const positions = new Set([
    ...board.worm,
    ...board.apples,
    ...board.obstacles,
    board.portal,
    ...(board.keys ?? []),
    ...(board.gates ?? []),
    ...(board.iceTiles ?? []),
    ...(board.teleports ?? []).flatMap(({ entry, exit }) => [entry, exit]),
  ].map(positionKey));
  const idsByType = (type) => new Set(
    features.filter(({ featureType }) => featureType === type).map(({ id }) => id),
  );
  const plateIds = idsByType("pressurePlates");
  const gateIds = idsByType("pressureGates");
  const switchIds = idsByType("timedSwitches");
  const doorIds = idsByType("timedDoors");
  const barrierIds = idsByType("rotatingBarriers");
  const referencedBarrierIds = new Set(
    features.filter(({ featureType }) => featureType === "rotatingSwitches")
      .flatMap(({ barrierIds: targets }) => targets ?? []),
  );

  for (const feature of features) {
    const { id, row, column, featureType } = feature;
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      ids.has(id) ||
      !Number.isInteger(row) ||
      !Number.isInteger(column) ||
      row < 0 ||
      row >= board.rows ||
      column < 0 ||
      column >= board.columns
    ) {
      throw new Error(`Board ${featureType} contain an invalid or duplicate feature.`);
    }
    const position = positionKey(feature);
    if (positions.has(position)) {
      throw new Error(`Board ${featureType} cannot overlap another tile.`);
    }
    if (
      (featureType === "goldenApples" || featureType === "treasures") &&
      (!Number.isSafeInteger(feature.reward) || feature.reward < 1)
    ) {
      throw new Error(`Board ${featureType} rewards must be positive safe integers.`);
    }
    if (
      featureType === "pressurePlates" &&
      (!Array.isArray(feature.opensGateIds) ||
        feature.opensGateIds.length === 0 ||
        feature.opensGateIds.some((gateId) => !gateIds.has(gateId)))
    ) {
      throw new Error("Pressure plates must reference existing pressure gates.");
    }
    if (featureType === "pressureGates" && !plateIds.has(feature.plateId)) {
      throw new Error("Pressure gates must reference an existing pressure plate.");
    }
    if (
      featureType === "timedSwitches" &&
      (!Number.isSafeInteger(feature.durationMoves) ||
        feature.durationMoves < 1 ||
        !Array.isArray(feature.doorIds) ||
        feature.doorIds.length === 0 ||
        feature.doorIds.some((doorId) => !doorIds.has(doorId)))
    ) {
      throw new Error("Timed switches must reference doors and have a positive timer.");
    }
    if (featureType === "timedDoors" && !switchIds.has(feature.switchId)) {
      throw new Error("Timed doors must reference an existing timed switch.");
    }
    if (
      featureType === "rotatingSwitches" &&
      (!Array.isArray(feature.barrierIds) ||
        feature.barrierIds.length === 0 ||
        feature.barrierIds.some((barrierId) => !barrierIds.has(barrierId)))
    ) {
      throw new Error("Rotating switches must reference existing barriers.");
    }
    if (
      featureType === "rotatingBarriers" &&
      !["horizontal", "vertical"].includes(feature.initialOrientation)
    ) {
      throw new Error("Rotating barriers require a horizontal or vertical orientation.");
    }
    if (
      featureType === "disappearingBridges" &&
      (!Number.isSafeInteger(feature.collapseAfterMoves) ||
        feature.collapseAfterMoves < 1)
    ) {
      throw new Error("Disappearing bridges require a positive collapse delay.");
    }
    ids.add(id);
    positions.add(position);
  }

  if (
    features.some(({ featureType, opensGateIds }) =>
      featureType === "pressurePlates" &&
      opensGateIds.some((gateId) => !gateIds.has(gateId))) ||
    features.some(({ featureType, doorIds: targets }) =>
      featureType === "timedSwitches" &&
      targets.some((doorId) => !doorIds.has(doorId))) ||
    features.some(({ featureType, barrierIds: targets }) =>
      featureType === "rotatingSwitches" &&
      targets.some((barrierId) => !barrierIds.has(barrierId))) ||
    features.some(({ featureType, plateId }) =>
      featureType === "pressureGates" && !plateIds.has(plateId)) ||
    features.some(({ featureType, switchId }) =>
      featureType === "timedDoors" && !switchIds.has(switchId)) ||
    features.some(({ featureType, id }) =>
      featureType === "rotatingBarriers" && !referencedBarrierIds.has(id)) ||
    features.some(({ featureType, barrierIds: targets }) =>
      featureType === "rotatingSwitches" &&
      targets.some((barrierId) => !barrierIds.has(barrierId)))
  ) {
    throw new Error("Board feature references must point to a matching trigger.");
  }
  return true;
}
