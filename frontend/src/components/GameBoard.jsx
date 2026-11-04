import React from "react";
import { useRef } from "react";

function hasPosition(positions, row, column) {
  return positions.some(
    (position) => position.row === row && position.column === column,
  );
}

const overlayContent = {
  paused: ["Paused", "Resume when you’re ready."],
  won: ["Level complete!", "You reached the portal."],
  lost: ["Worm blocked!", "Restart the level and try again."],
};

function GameBoard({ level, game, onMove }) {
  const { rows, columns, obstacles, portal } = level.board;
  const swipeStart = useRef(null);
  const overlay = overlayContent[game.status];

  function handlePointerDown(event) {
    if (event.pointerType === "mouse") {
      return;
    }

    swipeStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) {
      return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      onMove(deltaX > 0 ? "right" : "left");
    } else {
      onMove(deltaY > 0 ? "down" : "up");
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
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        {Array.from({ length: rows * columns }, (_, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const wormIndex = game.worm.findIndex(
            (segment) => segment.row === row && segment.column === column,
          );
          const isObstacle = hasPosition(obstacles, row, column);
          const isApple = hasPosition(game.apples, row, column);
          const isPortal = portal.row === row && portal.column === column;
          const cellContents = [
            wormIndex >= 0 ? "worm" : "",
            isApple ? "apple" : "",
            isObstacle ? "obstacle" : "",
            isPortal ? "portal" : "",
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
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${row}-${column}`}
            >
              {isPortal && <span className="portal" />}
              {isApple && (
                <span className="board-apple" role="presentation">
                  🍎
                </span>
              )}
              {wormIndex >= 0 && (
                <span
                  className={`worm-segment ${wormIndex === game.worm.length - 1 ? "worm-segment--head" : ""}`}
                >
                  {wormIndex === game.worm.length - 1 ? (
                    <span className="worm-eyes" />
                  ) : null}
                </span>
              )}
            </div>
          );
        })}
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
      </div>
    </div>
  );
}

export default GameBoard;
