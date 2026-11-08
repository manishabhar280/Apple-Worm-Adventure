import React from "react";
import { getGuestAchievements } from "../game/guestAchievements.js";
import { levels } from "../data/levelData.js";
import { PageHeading } from "../components/ScreenStates.jsx";
import { getDailyChallenge } from "../game/dailyChallenge.js";
import {
  getEquippedWormSkin,
  getUnlockedWormSkins,
  isWormSkinUnlocked,
  WORM_SKINS,
} from "../game/wormSkins.js";

function formatUnlockDate(unlockedAt) {
  if (!unlockedAt) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(unlockedAt));
}

function getRecentlyUnlocked(achievements) {
  return achievements
    .filter(({ unlocked, unlockedAt }) => unlocked && unlockedAt)
    .sort((first, second) =>
      Date.parse(second.unlockedAt) - Date.parse(first.unlockedAt))
    .slice(0, 3);
}

function AchievementSummary({ achievements, navigate }) {
  const earnedCount = achievements.filter(({ unlocked }) => unlocked).length;
  const completion = Math.round((earnedCount / achievements.length) * 100);
  const recent = getRecentlyUnlocked(achievements);

  return (
    <section className="achievement-summary" aria-label="Achievement collection summary">
      <div className="achievement-summary-topline">
        <div>
          <p className="eyebrow">Little milestones, big progress</p>
          <h2>Your achievement collection</h2>
        </div>
        <button className="inline-link" type="button" onClick={() => navigate("/achievements")}>
          View collection <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="achievement-summary-stats">
        <strong>{earnedCount}<span> / {achievements.length} earned</span></strong>
        <span>{completion}% complete</span>
      </div>
      <div
        className="achievement-summary-progress"
        role="progressbar"
        aria-label="Achievement collection completion"
        aria-valuemin={0}
        aria-valuemax={achievements.length}
        aria-valuenow={earnedCount}
      >
        <span style={{ width: `${completion}%` }} />
      </div>
      {recent.length > 0 ? (
        <ul className="recent-achievements" aria-label="Recently unlocked achievements">
          {recent.map((achievement) => (
            <li key={achievement.id}>
              <span aria-hidden="true">{achievement.icon}</span>
              <span>{achievement.title}</span>
              {achievement.unlockedAt && (
                <time dateTime={achievement.unlockedAt}>
                  {formatUnlockDate(achievement.unlockedAt)}
                </time>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="achievement-summary-empty">
          Your first milestone is waiting in the orchard.
        </p>
      )}
    </section>
  );
}

function AchievementsPage({ records, unlocks }) {
  const achievements = getGuestAchievements(records, unlocks);
  const earnedCount = achievements.filter(({ unlocked }) => unlocked).length;
  return (
    <main className="content-page">
      <PageHeading
        eyebrow="Milestones on your device"
        title="Achievements"
        description="Every milestone is earned through your own progress along one continuous 100-level journey."
      />
      <div className="achievement-collection-count" aria-live="polite">
        <strong>{earnedCount} of {achievements.length}</strong>
        <span>milestones earned</span>
      </div>
      <section className="achievement-grid" aria-label="Achievement collection">
        {achievements.map((achievement) => (
          <article
            className={`achievement-card ${achievement.unlocked ? "achievement-card--unlocked" : "achievement-card--locked"}`}
            key={achievement.id}
            aria-label={`${achievement.title}, ${achievement.unlocked ? "unlocked" : "locked"}`}
          >
            <span className="achievement-icon" aria-hidden="true">{achievement.icon}</span>
            <span className={`achievement-status ${achievement.unlocked ? "achievement-status--unlocked" : ""}`}>
              {achievement.unlocked ? "Unlocked" : "Locked"}
            </span>
            <h2>{achievement.title}</h2>
            <p>{achievement.description}</p>
            <div className="achievement-progress">
              <div
                className="achievement-progress-track"
                role="progressbar"
                aria-label={`${achievement.title} progress`}
                aria-valuemin={0}
                aria-valuemax={achievement.target}
                aria-valuenow={achievement.progress}
              >
                <span style={{
                  width: `${(achievement.progress / achievement.target) * 100}%`,
                }} />
              </div>
              <small>{achievement.progress.toLocaleString()} / {achievement.target.toLocaleString()}</small>
            </div>
            {achievement.unlockedAt ? (
              <time className="achievement-date" dateTime={achievement.unlockedAt}>
                Unlocked {formatUnlockDate(achievement.unlockedAt)}
              </time>
            ) : achievement.unlocked ? (
              <small className="achievement-date">Previously earned</small>
            ) : (
              <small className="achievement-date">Keep going to unlock</small>
            )}
          </article>
        ))}
      </section>
      <p className="mock-data-note">Your achievements are saved on this device. They do not grant online rewards.</p>
    </main>
  );
}

function StatisticCard({ label, value, detail, accent = "" }) {
  return (
    <article className={`statistics-card ${accent ? `statistics-card--${accent}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function StatisticsPage({ statistics, navigate }) {
  const {
    completedLevels,
    remainingLevels,
    completionPercentage,
    totalStars,
    totalApples,
    totalRecordedMoves,
    highestScore,
    highestScoringLevel,
    averageScore,
    bestPerformingLevel,
    totalAchievements,
    unlockedAchievements,
    recentAchievements,
    recentLevels,
    scoreRecords,
    maximumScore,
    totalGoldenApples,
    totalTreasures,
    guestCoins,
    dailyChallengesCompleted,
    currentDailyStreak,
    longestDailyStreak,
    efficientLevels,
  } = statistics;

  return (
    <main className="content-page statistics-page">
      <PageHeading
        eyebrow="Your adventure, in numbers"
        title="Player statistics"
        description="A clear look at your progress through one continuous 100-level journey. All figures come from saved results on this device."
      />

      <section className="statistics-overview" aria-label="Overall progress">
        <div className="statistics-overview-heading">
          <div>
            <p className="eyebrow">The whole orchard</p>
            <h2>{completedLevels} <span>/ 100 levels complete</span></h2>
          </div>
          <strong className="statistics-completion">{completionPercentage}%</strong>
        </div>
        <div
          className="statistics-progress-track"
          role="progressbar"
          aria-label="Overall level completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completedLevels}
        >
          <span style={{ width: `${completionPercentage}%` }} />
        </div>
        <div className="statistics-overview-footer">
          <span>{completedLevels} completed</span>
          <span>{remainingLevels} levels remaining</span>
        </div>
      </section>

      {completedLevels === 0 && (
        <section className="statistics-first-steps" aria-label="No levels completed yet">
          <div>
            <p className="eyebrow">A fresh adventure</p>
            <h2>Your first apple is waiting</h2>
            <p>Start with Level 1 whenever you’re ready. Your progress stays on this device.</p>
          </div>
          <button
            className="small-primary"
            type="button"
            onClick={() => navigate("/levels")}
          >
            Explore levels <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      <section className="statistics-card-grid" aria-label="Player overview">
        <StatisticCard label="Stars earned" value={totalStars.toLocaleString()} accent="sage" />
        <StatisticCard label="Levels remaining" value={remainingLevels.toLocaleString()} />
        <StatisticCard
          label="Achievements"
          value={`${unlockedAchievements} / ${totalAchievements}`}
          detail="unlocked"
          accent="olive"
        />
      </section>

      <section className="statistics-performance" aria-labelledby="performance-title">
        <div className="statistics-section-heading">
          <div>
            <p className="eyebrow">Saved best results</p>
            <h2 id="performance-title">Your performance</h2>
          </div>
          <span>Personal stats from completed levels</span>
        </div>
        <div className="statistics-card-grid statistics-card-grid--performance">
          <StatisticCard label="Apples collected" value={totalApples.toLocaleString()} />
          <StatisticCard
            label="Moves in saved bests"
            value={totalRecordedMoves.toLocaleString()}
            detail="not lifetime move history"
          />
          <StatisticCard
            label="Highest score"
            value={highestScore.toLocaleString()}
            detail={highestScoringLevel
              ? `Level ${highestScoringLevel}`
              : "No saved scores yet"}
            accent="sage"
          />
          <StatisticCard
            label="Best-performing level"
            value={bestPerformingLevel
              ? `Level ${bestPerformingLevel.levelNumber}`
              : "—"}
            detail={bestPerformingLevel
              ? `${bestPerformingLevel.stars} stars · ${bestPerformingLevel.score.toLocaleString()} points`
              : "Complete a level to begin"}
          />
          <StatisticCard
            label="Average saved score"
            value={averageScore === null
              ? "—"
              : Math.round(averageScore).toLocaleString()}
            detail={averageScore === null ? "No saved scores yet" : "per completed level"}
            accent="olive"
          />
        </div>
      </section>

      <section className="statistics-performance" aria-labelledby="engagement-title">
        <div className="statistics-section-heading">
          <div>
            <p className="eyebrow">Optional adventures</p>
            <h2 id="engagement-title">Bonus progress</h2>
          </div>
          <span>Guest rewards stay on this device.</span>
        </div>
        <div className="statistics-card-grid statistics-card-grid--performance">
          <StatisticCard label="Golden Apples" value={totalGoldenApples.toLocaleString()} />
          <StatisticCard label="Treasures found" value={totalTreasures.toLocaleString()} />
          <StatisticCard label="Guest coins" value={guestCoins.toLocaleString()} />
          <StatisticCard label="Daily challenges" value={dailyChallengesCompleted.toLocaleString()} />
          <StatisticCard
            label="Daily streak"
            value={`${currentDailyStreak} days`}
            detail={`Best: ${longestDailyStreak} days`}
          />
          <StatisticCard label="Efficient levels" value={efficientLevels.toLocaleString()} />
        </div>
      </section>

      <div className="statistics-detail-grid">
        <section className="statistics-panel" aria-labelledby="score-chart-title">
          <div className="statistics-section-heading">
            <div>
              <p className="eyebrow">Level by level</p>
              <h2 id="score-chart-title">Score profile</h2>
            </div>
          </div>
          {scoreRecords.length > 0 ? (
            <>
              <p className="statistics-panel-note">
                Saved best scores for the latest {scoreRecords.length} completed levels.
              </p>
              <div className="score-chart" role="list" aria-label="Saved score by level">
                {scoreRecords.map(({ levelNumber, score }) => {
                  const percentage = maximumScore > 0
                    ? Math.max(4, (score / maximumScore) * 100)
                    : 4;
                  return (
                    <div
                      className="score-chart-column"
                      key={levelNumber}
                      role="listitem"
                      aria-label={`Level ${levelNumber}: ${score.toLocaleString()} points`}
                      title={`Level ${levelNumber}: ${score.toLocaleString()} points`}
                    >
                      <span className="score-chart-bar" style={{ height: `${percentage}%` }} />
                      <small>{levelNumber}</small>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="statistics-empty">Complete a level to see your saved scores here.</p>
          )}
        </section>

        <section className="statistics-panel" aria-labelledby="recent-achievements-title">
          <div className="statistics-section-heading">
            <div>
              <p className="eyebrow">Milestones on this device</p>
              <h2 id="recent-achievements-title">Recent achievements</h2>
            </div>
          </div>
          {recentAchievements.length > 0 ? (
            <ul className="statistics-achievements" aria-label="Recent achievements">
              {recentAchievements.map((achievement) => (
                <li key={achievement.id}>
                  <span className="statistics-achievement-icon" aria-hidden="true">
                    {achievement.icon}
                  </span>
                  <span className="statistics-achievement-copy">
                    <strong>{achievement.title}</strong>
                    <small>{achievement.description}</small>
                  </span>
                  <time dateTime={achievement.unlockedAt}>
                    {formatUnlockDate(achievement.unlockedAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="statistics-empty">
              {unlockedAchievements > 0
                ? "Previously earned milestones have no saved unlock date."
                : "Your first achievement is waiting in the orchard."}
            </p>
          )}
        </section>

        <section className="statistics-panel statistics-panel--history" aria-labelledby="recent-levels-title">
          <div className="statistics-section-heading">
            <div>
              <p className="eyebrow">One continuous journey</p>
              <h2 id="recent-levels-title">Latest journey levels</h2>
            </div>
          </div>
          {recentLevels.length > 0 ? (
            <ol className="statistics-level-history">
              {recentLevels.map(({ levelNumber, score, moves, stars }) => (
                <li key={levelNumber}>
                  <span className="statistics-history-level">
                    <strong>Level {levelNumber}</strong>
                    <small>{levels[levelNumber - 1].name}</small>
                  </span>
                  <span className="statistics-history-stars" aria-label={`${stars} stars`}>
                    {"★".repeat(stars)}{"☆".repeat(3 - stars)}
                  </span>
                  <span className="statistics-history-result">
                    <strong>{score.toLocaleString()}</strong>
                    <small>{moves} moves</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="statistics-empty">Your completed levels will appear here.</p>
          )}
        </section>
      </div>

      <p className="statistics-footnote">
        Moves and scores summarize each level’s saved best result; they are not lifetime attempt totals.
      </p>
    </main>
  );
}

const settingDetails = {
  soundEffects: {
    label: "Sound Effects",
    description: "Soft original cues play for moves, apple collection and level completion.",
  },
  backgroundMusic: {
    label: "Background Music",
    description: "Original 8-bit arcade music starts during gameplay after your first interaction.",
  },
  vibration: {
    label: "Vibration",
    description: "Gentle feedback after an accepted move, when this device supports vibration.",
  },
  darkMode: {
    label: "Dark Mode",
    description: "Use a low-glare dark appearance across the game interface.",
  },
  reducedMotion: {
    label: "Reduced Motion",
    description: "Reduce non-essential movement and transitions. Your operating-system preference is also respected.",
  },
};

function SettingsPage({ settings, vibrationAvailable, onSettingChange }) {
  return (
    <main className="content-page">
      <PageHeading
        eyebrow="Your game preferences"
        title="Settings"
        description="Personalize how Apple Worm Adventure feels on this device."
      />
      <section className="content-card guest-settings" aria-label="Game settings">
        {Object.entries(settingDetails).map(([setting, detail]) => {
          const unsupportedVibration = setting === "vibration" && !vibrationAvailable;
          return (
            <div className="guest-setting" key={setting}>
              <span>
                <strong>{detail.label}</strong>
                <small>{unsupportedVibration
                  ? "Vibration is not supported by this browser or device. Your preference is still saved."
                  : detail.description}</small>
              </span>
              <button
                className="setting-switch"
                type="button"
                role="switch"
                aria-checked={settings[setting]}
                aria-label={detail.label}
                onClick={() => onSettingChange(setting, !settings[setting])}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </section>
      <p className="mock-data-note">Preferences use separate local storage from your guest progress. Clearing browser data removes both.</p>
    </main>
  );
}

function DailyChallengePage({ progress, onStart, onResume }) {
  const challenge = getDailyChallenge();
  const level = levels[challenge.levelNumber - 1];
  const daily = progress.engagement?.daily;
  const completed = Boolean(daily?.completions?.[challenge.date]);
  const active = progress.activeGame?.challengeDate === challenge.date;
  const otherActiveGame = progress.activeGame && !active;

  return (
    <main className="content-page engagement-page">
      <PageHeading
        eyebrow="A fresh puzzle every UTC day"
        title="Daily Challenge"
        description="Everyone gets the same featured level for a given UTC date. Your challenge history stays on this device."
      />
      <section className="content-card daily-challenge-card" aria-label="Today's daily challenge">
        <div className="daily-challenge-date">
          <span aria-hidden="true">📅</span>
          <time dateTime={challenge.date}>{challenge.date} (UTC)</time>
        </div>
        <p className="eyebrow">Today's featured puzzle</p>
        <h2>Level {challenge.levelNumber}: {level.name}</h2>
        <p>{challenge.objective}</p>
        <div className="daily-challenge-reward">
          <strong>+{challenge.reward} guest coins</strong>
          <span>One reward per UTC day. Coins are local cosmetic progress and are not server wallet currency.</span>
        </div>
        <div className="daily-streak" aria-label={`Current streak ${daily?.currentStreak ?? 0} days; longest streak ${daily?.longestStreak ?? 0} days`}>
          <span>🔥</span>
          <strong>{daily?.currentStreak ?? 0} day streak</strong>
          <small>Best: {daily?.longestStreak ?? 0} days</small>
        </div>
        {otherActiveGame ? (
          <>
            <p className="daily-challenge-note">
              Level {progress.activeGame.levelNumber} is still in progress. Resume it first; your puzzle will remain saved.
            </p>
            <button className="small-primary" type="button" onClick={onResume}>
              Resume Level {progress.activeGame.levelNumber}
              <span aria-hidden="true">→</span>
            </button>
          </>
        ) : completed ? (
          <p className="daily-challenge-complete" role="status">Today's challenge is complete.</p>
        ) : (
          <button className="small-primary" type="button" onClick={onStart}>
            {active ? "Resume today's challenge" : "Start today's challenge"}
            <span aria-hidden="true">→</span>
          </button>
        )}
        {challenge.levelNumber > progress.unlockedLevel && (
          <p className="daily-challenge-note">
            This featured puzzle can be played as a challenge without changing your continuous level unlocks.
          </p>
        )}
      </section>
    </main>
  );
}

function WormCollectionPage({ records, selectedSkin, onSelect, engagement }) {
  const [previewSkin, setPreviewSkin] = React.useState(
    getEquippedWormSkin(selectedSkin, records),
  );
  const unlockedSkins = getUnlockedWormSkins(records);
  const equippedSkin = getEquippedWormSkin(selectedSkin, records);

  return (
    <main className="content-page engagement-page worm-collection-page">
      <PageHeading
        eyebrow="Cosmetics earned through play"
        title="Worm Collection"
        description="Preview every look, then equip skins unlocked by your continuous level progress. Skins are visual only."
      />
      <section className="content-card collection-preview" aria-label="Worm skin preview">
        <p className="eyebrow">Preview</p>
        <div className={`skin-preview-worm skin-preview-worm--${previewSkin}`} aria-label={`${WORM_SKINS.find(({ id }) => id === previewSkin)?.name ?? "Classic Worm"} preview`}>
          <span /><span /><span className="skin-preview-head"><i /><i /></span>
        </div>
        <div className="collection-coins">
          <strong>🪙 {engagement?.coins ?? 0} guest coins</strong>
          <small>Earned rewards are stored locally for this cosmetic collection.</small>
        </div>
      </section>
      <section className="worm-skin-grid" aria-label="Worm skin collection">
        {WORM_SKINS.map((skin) => {
          const unlocked = isWormSkinUnlocked(skin.id, records);
          const equipped = equippedSkin === skin.id;
          return (
            <article
              className={`worm-skin-card ${unlocked ? "worm-skin-card--unlocked" : "worm-skin-card--locked"}`}
              key={skin.id}
              aria-label={`${skin.name}, ${unlocked ? "unlocked" : "locked"}`}
            >
              <div className={`worm-skin-swatch worm-skin-swatch--${skin.id}`} aria-hidden="true">
                <span /><span /><span />
              </div>
              <h2>{skin.name}</h2>
              <p>{skin.description}</p>
              <small>{unlocked ? "Unlocked" : skin.requirement}</small>
              <div className="worm-skin-actions">
                <button
                  type="button"
                  className="control-button control-button--quiet"
                  onClick={() => setPreviewSkin(skin.id)}
                  aria-pressed={previewSkin === skin.id}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="control-button control-button--primary"
                  disabled={!unlocked || equipped}
                  onClick={() => onSelect(skin.id)}
                >
                  {equipped ? "Equipped" : "Equip"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
      <p className="mock-data-note">
        {unlockedSkins.length} of {WORM_SKINS.length} skins unlocked on this device. Guest coins are separate from the authenticated server wallet.
      </p>
    </main>
  );
}

export {
  AchievementSummary,
  AchievementsPage,
  DailyChallengePage,
  SettingsPage,
  StatisticsPage,
  WormCollectionPage,
};
