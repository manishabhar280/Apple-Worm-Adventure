import React from "react";

function LevelPanel({ level, totalLevels, unlockedLevel, record }) {
  const progress = (unlockedLevel / totalLevels) * 100;

  return (
    <aside className="level-panel" aria-labelledby="level-panel-title">
      <div className="panel-topline">
        <span className="panel-icon" aria-hidden="true">✿</span>
        <span className="panel-kicker">YOUR JOURNEY</span>
      </div>
      <h2 id="level-panel-title">{level.name}</h2>
      <p className="panel-description">{level.description}</p>

      <div className="objective-card">
        <span className="objective-icon" aria-hidden="true">◎</span>
        <div>
          <span className="objective-label">LEVEL OBJECTIVE</span>
          <p>{level.objective}</p>
        </div>
      </div>

      <div className="panel-divider" />

      <div className="progress-heading">
        <span>Level progress</span>
        <span>{unlockedLevel} / {totalLevels}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Unlocked levels"
        aria-valuemin={0}
        aria-valuemax={totalLevels}
        aria-valuenow={unlockedLevel}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      {record && (
        <div className="level-record" aria-label={`Best result: ${record.stars} stars, ${record.moves} moves, ${record.score} points`}>
          <div className="record-heading">
            <span>Best result</span>
            <span className="record-stars" aria-label={`${record.stars} stars`}>
              {"★".repeat(record.stars)}{"☆".repeat(3 - record.stars)}
            </span>
          </div>
          <div className="record-stats">
            <span><strong>{record.score}</strong> points</span>
            <span><strong>{record.moves}</strong> moves</span>
          </div>
        </div>
      )}

      <div className="tip-card">
        <span className="tip-icon" aria-hidden="true">☀</span>
        <p><strong>Little tip</strong> Collect every apple before entering the portal.</p>
      </div>
    </aside>
  );
}

export default LevelPanel;
