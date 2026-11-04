import React from "react";

function LevelSelector({
  levels,
  unlockedLevel,
  selectedLevel,
  records,
  onSelect,
}) {
  return (
    <section className="level-selector" aria-labelledby="level-selector-title">
      <div className="level-selector-heading">
        <h3 id="level-selector-title">Choose a level</h3>
        <span>{unlockedLevel} / {levels.length} unlocked</span>
      </div>
      <div className="level-grid">
        {levels.map((level) => {
          const record = records[level.number];
          const unlocked = level.number <= unlockedLevel;
          return (
            <button
              className={[
                "level-select-button",
                level.number === selectedLevel ? "level-select-button--selected" : "",
                record ? "level-select-button--complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              key={level.number}
              disabled={!unlocked}
              onClick={() => onSelect(level)}
              aria-label={[
                `Level ${level.number}: ${level.name}`,
                unlocked ? "" : "locked",
                record ? `${record.stars} stars` : "",
              ]
                .filter(Boolean)
                .join(", ")}
              aria-current={level.number === selectedLevel ? "page" : undefined}
              title={unlocked ? level.name : `Complete level ${level.number - 1} to unlock`}
            >
              <span>{String(level.number).padStart(2, "0")}</span>
              <span className="level-select-stars" aria-hidden="true">
                {record ? "★".repeat(record.stars) : unlocked ? "" : "·"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default LevelSelector;
