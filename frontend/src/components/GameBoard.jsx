import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getMovingObstaclePositions,
  isChallengeLevel,
} from "../game/gameLogic.js";
import { getSwipeDirection } from "../game/swipeGesture.js";
import {
  buildDynamicBoardIndexes,
  buildStaticBoardIndexes,
} from "../game/boardIndexes.js";

const overlayContent = {
  lost: ["Worm blocked!", "Restart the level and try again."],
};
const emptyPositions = [];

function GameBoard({ level, game, onMove, wormSkin = "classic" }) {
  const previousApples = useRef({
    levelNumber: level.number,
    apples: game.apples,
    goldenIds: game.collectedGoldenAppleIds ?? [],
    treasureIds: game.collectedTreasureIds ?? [],
  });
  const collectionTimer = useRef(null);
  const effectId = useRef(0);
  const [collectionEffect, setCollectionEffect] = useState(null);
  const {
    rows,
    columns,
    obstacles,
    portal,
    keys = emptyPositions,
    gates = emptyPositions,
    teleports = emptyPositions,
    movingObstacles = emptyPositions,
    iceTiles = emptyPositions,
  } = level.board;
  const obstacleTick = game.freezeActionsRemaining > 0
    ? game.frozenObstacleTick
    : game.moves - (game.movingObstacleOffset || 0);
  const staticIndexes = useMemo(
    () => buildStaticBoardIndexes(level.board),
    [level.board],
  );
  const movingObstaclePositions = useMemo(
    () => movingObstacles.length > 0
      ? getMovingObstaclePositions(level.board, obstacleTick)
      : emptyPositions,
    [level.board, movingObstacles, obstacleTick],
  );
  const dynamicIndexes = useMemo(
    () => buildDynamicBoardIndexes(columns, game, movingObstaclePositions),
    [columns, game.apples, game.worm, movingObstaclePositions],
  );
  const activeSwipe = useRef(null);
  useEffect(() => {
    const previous = previousApples.current;
    previousApples.current = { levelNumber: level.number, apples: game.apples };
    if (previous.levelNumber !== level.number) {
      if (collectionTimer.current !== null) {
        window.clearTimeout(collectionTimer.current);
        collectionTimer.current = null;
      }
      previousApples.current = {
        levelNumber: level.number,
        apples: game.apples,
        goldenIds: game.collectedGoldenAppleIds ?? [],
        treasureIds: game.collectedTreasureIds ?? [],
      };
      setCollectionEffect(null);
      return;
    }
    previousApples.current = {
      levelNumber: level.number,
      apples: game.apples,
      goldenIds: game.collectedGoldenAppleIds ?? [],
      treasureIds: game.collectedTreasureIds ?? [],
    };
    const collectedApple = previous.apples.find((apple) =>
      !game.apples.some((remaining) =>
        remaining.row === apple.row && remaining.column === apple.column),
    );
    const newGoldenId = (game.collectedGoldenAppleIds ?? [])
      .find((id) => !previous.goldenIds.includes(id));
    const newTreasureId = (game.collectedTreasureIds ?? [])
      .find((id) => !previous.treasureIds.includes(id));
    const goldenApple = (level.board.goldenApples ?? [])
      .find(({ id }) => id === newGoldenId);
    const treasure = (level.board.treasures ?? [])
      .find(({ id }) => id === newTreasureId);
    const collected = collectedApple
      ? { ...collectedApple, type: "apple" }
      : goldenApple
        ? { ...goldenApple, type: "golden" }
        : treasure
          ? { ...treasure, type: "treasure" }
          : null;
    if (!collected) return;

    if (collectionTimer.current !== null) {
      window.clearTimeout(collectionTimer.current);
    }
    setCollectionEffect({ ...collected, id: ++effectId.current });
    collectionTimer.current = window.setTimeout(() => {
      setCollectionEffect(null);
      collectionTimer.current = null;
    }, 650);
  }, [
    game.apples,
    game.collectedGoldenAppleIds,
    game.collectedTreasureIds,
    level.board,
    level.number,
  ]);

  useEffect(() => () => {
    if (collectionTimer.current !== null) {
      window.clearTimeout(collectionTimer.current);
    }
  }, []);

  const overlay =
    isChallengeLevel(level) && game.status === "lost"
      ? [
          "Challenge failed",
          game.failureReason === "move-limit"
            ? "Move limit reached before the level was completed."
            : "The worm was blocked before completing the challenge.",
        ]
      : overlayContent[game.status];

  function handlePointerDown(event) {
    if (
      event.pointerType === "mouse" ||
      !event.isPrimary ||
      activeSwipe.current !== null ||
      !["ready", "playing"].includes(game.status)
    ) {
      return;
    }

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }

    activeSwipe.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event) {
    const swipe = activeSwipe.current;
    if (
      !swipe ||
      event.pointerId !== swipe.pointerId
    ) {
      return;
    }
    activeSwipe.current = null;
    if (!["ready", "playing"].includes(game.status)) return;

    const direction = getSwipeDirection(swipe.start, {
      x: event.clientX,
      y: event.clientY,
    });
    if (direction) onMove(direction);
  }

  function clearSwipe(event) {
    if (
      activeSwipe.current &&
      (event.pointerId === undefined ||
        event.pointerId === activeSwipe.current.pointerId)
    ) {
      activeSwipe.current = null;
    }
  }

  return (
    <div className="board-frame">
      <div
        className="game-board"
        role="grid"
        tabIndex={0}
        aria-label={`Level ${level.number} game board`}
        style={{ "--board-columns": columns, "--board-rows": rows }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={clearSwipe}
        onLostPointerCapture={clearSwipe}
      >
        {Array.from({ length: rows * columns }, (_, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const wormIndex = dynamicIndexes.wormIndexByCell.get(index) ?? -1;
          const isObstacle = staticIndexes.obstacleIndices.has(index);
          const isApple = dynamicIndexes.appleIndices.has(index);
          const isPortal = portal.row === row && portal.column === column;
          const key = staticIndexes.keyByCell.get(index);
          const isKeyCollected = key && game.collectedKeyIds?.includes(key.id);
          const gate = staticIndexes.gateByCell.get(index);
          const isGateOpen = gate && game.collectedKeyIds?.includes(gate.keyId);
          const teleportEntry = staticIndexes.teleportEntryByCell.get(index);
          const teleportExit = staticIndexes.teleportExitByCell.get(index);
          const movingObstacle = dynamicIndexes.movingObstacleByCell.get(index);
          const isIce = staticIndexes.iceIndices.has(index);
          const goldenApple = staticIndexes.goldenAppleByCell.get(index);
          const treasure = staticIndexes.treasureByCell.get(index);
          const pressurePlate = staticIndexes.pressurePlateByCell.get(index);
          const pressureGate = staticIndexes.pressureGateByCell.get(index);
          const bridge = staticIndexes.bridgeByCell.get(index);
          const timedSwitch = staticIndexes.timedSwitchByCell.get(index);
          const timedDoor = staticIndexes.timedDoorByCell.get(index);
          const rotatingSwitch = staticIndexes.rotatingSwitchByCell.get(index);
          const rotatingBarrier = staticIndexes.rotatingBarrierByCell.get(index);
          const head = game.worm.at(-1);
          const treasureDiscovered = treasure && (
            game.collectedTreasureIds?.includes(treasure.id) ||
            Math.abs(head.row - treasure.row) + Math.abs(head.column - treasure.column) <= 1
          );
          const isPressureGateOpen = pressureGate &&
            game.openedPressureGateIds?.includes(pressureGate.id);
          const isBridgeCollapsed = bridge &&
            game.collapsedBridgeIds?.includes(bridge.id);
          const timedDoorRemaining = timedDoor
            ? Math.max(0, (game.timedDoorExpiry?.[timedDoor.id] ?? 0) - game.moves)
            : 0;
          const barrierOrientation = rotatingBarrier
            ? game.rotatingBarrierOrientations?.[rotatingBarrier.id] ??
              rotatingBarrier.initialOrientation
            : null;
          const cellContents = [
            wormIndex >= 0 ? "worm" : "",
            isApple ? "apple" : "",
            goldenApple ? "golden apple" : "",
            treasureDiscovered ? "hidden treasure" : "",
            isObstacle ? "obstacle" : "",
            isPortal ? "portal" : "",
            key && !isKeyCollected ? "key" : "",
            gate ? (isGateOpen ? "open gate" : "locked gate") : "",
            teleportEntry ? `teleport entry ${teleportEntry.id}` : "",
            teleportExit ? `teleport exit ${teleportExit.id}` : "",
            movingObstacle ? `moving obstacle ${movingObstacle.id}` : "",
            isIce ? "ice" : "",
            pressurePlate ? "pressure plate" : "",
            pressureGate ? (isPressureGateOpen ? "open pressure gate" : "closed pressure gate") : "",
            bridge ? (isBridgeCollapsed ? "collapsed bridge" : "disappearing bridge") : "",
            timedSwitch ? "timed switch" : "",
            timedDoor ? `timed door, ${timedDoorRemaining} moves remaining` : "",
            rotatingSwitch ? "rotating switch" : "",
            rotatingBarrier ? `${barrierOrientation} rotating barrier` : "",
          ]
            .filter(Boolean)
            .join(", ");

          return (
            <div
              role="gridcell"
              aria-label={`Row ${row + 1}, column ${column + 1}${cellContents ? `: ${cellContents}` : ""}`}
              className={[
                "board-cell",
                (row + column) % 2 === 0 ? "board-cell--light" : "board-cell--dark",
                isObstacle ? "board-cell--obstacle" : "",
                isIce ? "board-cell--ice" : "",
                goldenApple ? "board-cell--golden-apple" : "",
                treasureDiscovered ? "board-cell--treasure" : "",
                pressurePlate ? "board-cell--pressure-plate" : "",
                pressureGate && !isPressureGateOpen ? "board-cell--pressure-gate" : "",
                bridge && isBridgeCollapsed ? "board-cell--collapsed-bridge" : "",
                timedDoor && timedDoorRemaining > 0 ? "board-cell--timed-door-open" : "",
                rotatingBarrier ? `board-cell--barrier-${barrierOrientation}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${row}-${column}`}
            >
              {isIce && <span className="ice-tile" aria-hidden="true">❄</span>}
              {goldenApple && (
                <span className="board-golden-apple" aria-hidden="true">🌟</span>
              )}
              {treasureDiscovered && (
                <span className={`board-treasure ${game.collectedTreasureIds?.includes(treasure.id) ? "board-treasure--opened" : ""}`} aria-hidden="true">
                  {game.collectedTreasureIds?.includes(treasure.id) ? "✨" : "🧰"}
                </span>
              )}
              {pressurePlate && (
                <span className="board-pressure-plate" aria-hidden="true">▰</span>
              )}
              {pressureGate && (
                <span className={`board-pressure-gate ${isPressureGateOpen ? "board-pressure-gate--open" : ""}`} aria-hidden="true">
                  {isPressureGateOpen ? "↗" : "▥"}
                </span>
              )}
              {bridge && (
                <span className={`board-bridge ${isBridgeCollapsed ? "board-bridge--collapsed" : ""}`} aria-hidden="true">
                  {isBridgeCollapsed ? "·" : "═"}
                </span>
              )}
              {timedSwitch && (
                <span className="board-timed-switch" aria-hidden="true">◷</span>
              )}
              {timedDoor && (
                <span className={`board-timed-door ${timedDoorRemaining > 0 ? "board-timed-door--open" : ""}`} aria-hidden="true">
                  {timedDoorRemaining > 0 ? timedDoorRemaining : "▥"}
                </span>
              )}
              {rotatingSwitch && (
                <span className="board-rotating-switch" aria-hidden="true">⟳</span>
              )}
              {rotatingBarrier && (
                <span className="board-rotating-barrier" aria-hidden="true">
                  {barrierOrientation === "vertical" ? "┃" : "━"}
                </span>
              )}
              {isPortal && <span className="portal" />}
              {key && !isKeyCollected && (
                <span className="board-key" aria-hidden="true">🔑</span>
              )}
              {gate && (
                <span
                  className={`board-gate ${isGateOpen ? "board-gate--open" : "board-gate--locked"}`}
                  aria-hidden="true"
                >
                  {isGateOpen ? "↗" : "▥"}
                </span>
              )}
              {teleportEntry && (
                <span className="teleport-tile teleport-tile--entry" aria-hidden="true">
                  IN
                </span>
              )}
              {teleportExit && (
                <span className="teleport-tile teleport-tile--exit" aria-hidden="true">
                  OUT
                </span>
              )}
              {movingObstacle && (
                <span className="moving-obstacle" aria-hidden="true">
                  ✦
                </span>
              )}
              {isApple && (
                <span className="board-apple" role="presentation">
                  🍎
                </span>
              )}
            </div>
          );
        })}
        <div
          className={`worm-layer worm-layer--skin-${wormSkin} ${collectionEffect ? `worm-layer--collecting worm-layer--${collectionEffect.type}` : ""}`}
          aria-hidden="true"
        >
          {game.worm.map((segment, index) => {
            const isHead = index === game.worm.length - 1;
            const neck = isHead ? game.worm[index - 1] : null;
            let headAngle = 0;
            if (neck?.row === segment.row) {
              headAngle = segment.column > neck.column ? 90 : 270;
            } else if (neck) {
              headAngle = segment.row > neck.row ? 180 : 0;
            }
            return (
              <span
                className="worm-position"
                key={index}
                style={{
                  transform: `translate(${segment.column * 100}%, ${segment.row * 100}%)`,
                  width: `${100 / columns}%`,
                  height: `${100 / rows}%`,
                  "--worm-angle": `${headAngle}deg`,
                }}
              >
                <span className={`worm-segment ${isHead ? "worm-segment--head" : ""}`}>
                  {isHead && <span className="worm-eyes" />}
                </span>
              </span>
            );
          })}
        </div>
        {collectionEffect && (
          <div
            className="apple-collection-effect"
            aria-hidden="true"
            key={collectionEffect.id}
            style={{
              left: `${collectionEffect.column * 100 / columns}%`,
              top: `${collectionEffect.row * 100 / rows}%`,
              width: `${100 / columns}%`,
              height: `${100 / rows}%`,
            }}
          >
            <span>{collectionEffect.type === "golden" ? "✷" : collectionEffect.type === "treasure" ? "✦" : "✧"}</span>
            <span>{collectionEffect.type === "treasure" ? "◆" : "✦"}</span>
            <span>{collectionEffect.type === "golden" ? "✧" : "✦"}</span>
            <span>{collectionEffect.type === "apple" ? "✧" : "✷"}</span>
          </div>
        )}
        {overlay && (
          <div className="game-overlay" role="status" aria-live="polite">
            <div className="game-overlay-card">
              <strong>{overlay[0]}</strong>
              <span>{overlay[1]}</span>
            </div>
          </div>
        )}
      </div>
      <div className="board-legend" aria-label="Game board legend">
        <span><i className="legend-dot legend-dot--worm" /> Worm</span>
        <span><i className="legend-dot legend-dot--apple" /> Apple</span>
        <span><i className="legend-dot legend-dot--wall" /> Wall</span>
        <span><i className="legend-dot legend-dot--portal" /> Portal</span>
        {keys.length > 0 && <span><i className="legend-key" /> Key</span>}
        {gates.length > 0 && (
          <>
            <span><i className="legend-gate legend-gate--locked" /> Locked gate</span>
            <span><i className="legend-gate legend-gate--open" /> Open gate</span>
          </>
        )}
        {teleports.length > 0 && (
          <>
            <span><i className="legend-teleport legend-teleport--entry" /> Teleport entry</span>
            <span><i className="legend-teleport legend-teleport--exit" /> Teleport exit</span>
          </>
        )}
        {movingObstacles.length > 0 && (
          <span><i className="legend-moving-obstacle" /> Moving obstacle</span>
        )}
        {iceTiles.length > 0 && <span><i className="legend-ice" /> Ice</span>}
        {(level.board.goldenApples ?? []).length > 0 && <span><i className="legend-golden-apple" /> Golden Apple</span>}
        {(level.board.treasures ?? []).length > 0 && <span><i className="legend-treasure" /> Hidden treasure</span>}
        {(level.board.pressurePlates ?? []).length > 0 && <span><i className="legend-pressure-plate" /> Pressure plate</span>}
        {(level.board.disappearingBridges ?? []).length > 0 && <span><i className="legend-bridge" /> Disappearing bridge</span>}
        {(level.board.timedDoors ?? []).length > 0 && <span><i className="legend-timed-door" /> Timed door</span>}
        {(level.board.rotatingBarriers ?? []).length > 0 && <span><i className="legend-rotating-barrier" /> Rotating barrier</span>}
      </div>
    </div>
  );
}

export default React.memo(GameBoard);
