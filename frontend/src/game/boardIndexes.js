function cellIndex(columns, position) {
  return position.row * columns + position.column;
}

function indexPositions(columns, positions) {
  const indexes = new Set();
  for (const position of positions) indexes.add(cellIndex(columns, position));
  return indexes;
}

function indexByCell(columns, positions) {
  const indexes = new Map();
  for (const position of positions) {
    const index = cellIndex(columns, position);
    if (!indexes.has(index)) indexes.set(index, position);
  }
  return indexes;
}

export function buildStaticBoardIndexes(board) {
  const columns = board.columns;
  const teleports = board.teleports || [];
  const teleportEntries = teleports.map(({ entry }) => entry);
  const teleportExits = teleports.map(({ exit }) => exit);

  return {
    obstacleIndices: indexPositions(columns, board.obstacles),
    keyByCell: indexByCell(columns, board.keys || []),
    gateByCell: indexByCell(columns, board.gates || []),
    teleportEntryByCell: indexByCell(columns, teleportEntries),
    teleportExitByCell: indexByCell(columns, teleportExits),
    iceIndices: indexPositions(columns, board.iceTiles || []),
    goldenAppleByCell: indexByCell(columns, board.goldenApples || []),
    treasureByCell: indexByCell(columns, board.treasures || []),
    pressurePlateByCell: indexByCell(columns, board.pressurePlates || []),
    pressureGateByCell: indexByCell(columns, board.pressureGates || []),
    bridgeByCell: indexByCell(columns, board.disappearingBridges || []),
    timedSwitchByCell: indexByCell(columns, board.timedSwitches || []),
    timedDoorByCell: indexByCell(columns, board.timedDoors || []),
    rotatingSwitchByCell: indexByCell(columns, board.rotatingSwitches || []),
    rotatingBarrierByCell: indexByCell(columns, board.rotatingBarriers || []),
  };
}

export function buildDynamicBoardIndexes(columns, game, movingObstaclePositions) {
  const wormIndexByCell = new Map();
  for (let index = 0; index < game.worm.length; index += 1) {
    const cell = cellIndex(columns, game.worm[index]);
    if (!wormIndexByCell.has(cell)) wormIndexByCell.set(cell, index);
  }

  return {
    wormIndexByCell,
    appleIndices: indexPositions(columns, game.apples),
    movingObstacleByCell: indexByCell(columns, movingObstaclePositions),
  };
}
