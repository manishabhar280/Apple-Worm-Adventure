import React from "react";

function LevelSelector({
  levels,
  unlockedLevel,
  selectedLevel,
  records,
  onSelect,
  title = "Choose a level",
}) {
  const availableCount = levels.filter(
    (level) => level.number <= unlockedLevel,
  ).length;
  const completedCount = levels.filter((level) => records[level.number]).length;

  return (
    <section className="level-selector" aria-labelledby="level-selector-title">
      <div className="level-selector-heading">
        <div>
          <h3 id="level-selector-title">{title}</h3>
          <p>{completedCount} completed · {availableCount} available · {levels.length} total</p>
        </div>
        <span>1–{levels.length}</span>
      </div>
      <div className="level-grid" role="group" aria-label="Continuous level progression">
        {levels.map((level) => {
          const record = records[level.number];
          const unlocked = level.number <= unlockedLevel;
          const selected = level.number === selectedLevel;
          const stateLabel = record
            ? `completed, ${record.stars} stars`
            : unlocked
              ? "unlocked"
              : "locked";
          return (
            <button
              className={[
                "level-select-button",
                unlocked ? "level-select-button--unlocked" : "level-select-button--locked",
                selected ? "level-select-button--selected" : "",
                record ? "level-select-button--complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              key={level.number}
              disabled={!unlocked}
              onClick={() => onSelect(level)}
              aria-label={`Level ${level.number}: ${level.name}, ${stateLabel}${selected ? ", currently selected" : ""}`}
              aria-current={level.number === selectedLevel ? "page" : undefined}
              title={unlocked ? `${level.name} · ${stateLabel}` : `Complete level ${level.number - 1} to unlock`}
            >
              <span>{String(level.number).padStart(2, "0")}</span>
              <span className="level-select-state" aria-hidden="true">
                {record ? "★".repeat(record.stars) : selected ? "NOW" : unlocked ? "OPEN" : "LOCK"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default LevelSelector;
