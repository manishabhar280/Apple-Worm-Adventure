import React from "react";
import LevelSelector from "../components/LevelSelector.jsx";
import { PageHeading } from "../components/ScreenStates.jsx";
import { levels } from "../data/levelData.js";

function LevelsPage({ unlockedLevel, records, selectedLevel, onSelect, navigate }) {
  return (
    <main className="content-page">
      <PageHeading
        eyebrow="Choose your path"
        title="The orchard levels"
        description="Every trail has a little puzzle tucked inside. Complete a level to open the next one."
      />
      <section className="level-overview-card">
        <span className="overview-icon" aria-hidden="true">🌳</span>
        <div><strong>{unlockedLevel} of {levels.length} levels unlocked</strong><p>Pick any open trail and see where it leads.</p></div>
        <button className="small-primary" type="button" onClick={() => navigate("/game")}>Play selected →</button>
      </section>
      <div className="level-page-selector">
        <LevelSelector
          levels={levels}
          unlockedLevel={unlockedLevel}
          selectedLevel={selectedLevel}
          records={records}
          onSelect={(level) => onSelect(level)}
        />
      </div>
      <p className="mock-data-note">Your unlocked levels and completion records are saved to your account.</p>
    </main>
  );
}

export default LevelsPage;
