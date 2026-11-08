import React from "react";
import { PageHeading } from "../components/ScreenStates.jsx";
import { levels } from "../data/levelData.js";
import LevelSelector from "../components/LevelSelector.jsx";

function LevelsPage({ unlockedLevel, records, activeGame, onSelect }) {
  const completedCount = Object.keys(records).length;
  const totalLevels = levels.length;
  const nextLevelNumber = Math.min(unlockedLevel, totalLevels);
  const nextLevel = levels[nextLevelNumber - 1];
  const resumeLevel = activeGame
    ? levels[activeGame.levelNumber - 1]
    : null;
  const featuredLevel = resumeLevel ?? nextLevel;

  return (
    <main className="content-page">
      <PageHeading
        eyebrow="One continuous adventure"
        title="The 100-level journey"
        description="Every level leads to the next. Collect apples, earn stars, and follow one unbroken trail to the final portal."
      />

      <section className="journey-overview" aria-label="Adventure progress">
        <div className="journey-overview-copy">
          <span className="journey-mark" aria-hidden="true">🍏</span>
          <div>
            <p className="eyebrow">{resumeLevel ? "Continue your puzzle" : "Your next step"}</p>
            <h2>{resumeLevel
              ? `Pick up Level ${resumeLevel.number}`
              : `Level ${nextLevel.number} is ready`}</h2>
            <p>{completedCount} of {totalLevels} levels completed · {unlockedLevel} available to play</p>
          </div>
        </div>
        <button
          className="small-primary"
          type="button"
          onClick={() => onSelect(featuredLevel)}
        >
          {resumeLevel
            ? `Resume Level ${resumeLevel.number}`
            : `Play Level ${nextLevel.number}`}
          <span aria-hidden="true">→</span>
        </button>
        <div
          className="journey-progress-track"
          role="progressbar"
          aria-label="Completed levels"
          aria-valuemin={0}
          aria-valuemax={totalLevels}
          aria-valuenow={completedCount}
        >
          <span style={{ width: `${(completedCount / totalLevels) * 100}%` }} />
        </div>
      </section>

      <section className="journey-level-selector" aria-label="All 100 levels">
        <LevelSelector
          levels={levels}
          unlockedLevel={unlockedLevel}
          selectedLevel={nextLevelNumber}
          records={records}
          onSelect={onSelect}
          title="Follow the path"
        />
      </section>
    </main>
  );
}

export default LevelsPage;
