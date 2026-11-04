import React from "react";

function GameHeader({ level, score, moves }) {
  return (
    <header className="game-header">
      <a className="brand" href="/" aria-label="Apple Worm Adventure home">
        <span className="brand-icon" aria-hidden="true">
          🍏
        </span>
        <span>
          <span className="brand-title">Apple Worm</span>
          <span className="brand-subtitle">ADVENTURE</span>
        </span>
      </a>

      <div className="header-stats" aria-label="Current game stats">
        <div className="stat">
          <span className="stat-label">LEVEL</span>
          <span className="stat-value">{String(level).padStart(2, "0")}</span>
        </div>
        <div className="stat">
          <span className="stat-label">SCORE</span>
          <span className="stat-value">{score}</span>
        </div>
        <div className="stat">
          <span className="stat-label">MOVES</span>
          <span className="stat-value">{String(moves).padStart(2, "0")}</span>
        </div>
      </div>
    </header>
  );
}

export default GameHeader;
