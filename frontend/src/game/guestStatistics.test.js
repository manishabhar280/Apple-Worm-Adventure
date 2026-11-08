import assert from "node:assert/strict";
import test from "node:test";
import { getGuestStatistics } from "./guestStatistics.js";
import { ACHIEVEMENT_CATALOG } from "./guestAchievements.js";
import { levels, TOTAL_LEVELS } from "../data/levelData.js";

function recordsForLevels(count) {
  return Object.fromEntries(
    levels.slice(0, count).map((level, index) => [
      level.number,
      {
        score: (index + 1) * 100,
        moves: (index + 1) * 3,
        stars: index % 3 + 1,
      },
    ]),
  );
}

test("returns honest zero-progress statistics for a new or legacy guest", () => {
  const statistics = getGuestStatistics({
    records: {},
    unlockedLevel: 1,
    settings: { reducedMotion: false },
  });
  const missingProgress = getGuestStatistics();

  for (const result of [statistics, missingProgress]) {
    assert.equal(result.completedLevels, 0);
    assert.equal(result.remainingLevels, TOTAL_LEVELS);
    assert.equal(result.completionPercentage, 0);
    assert.equal(result.totalStars, 0);
    assert.equal(result.totalApples, 0);
    assert.equal(result.totalRecordedMoves, 0);
    assert.equal(result.highestScore, 0);
    assert.equal(result.averageScore, null);
    assert.equal(result.bestPerformingLevel, null);
    assert.equal(result.unlockedAchievements, 0);
    assert.deepEqual(result.recentAchievements, []);
    assert.deepEqual(result.recentLevels, []);
    assert.deepEqual(result.scoreRecords, []);
  }
});

test("reports optional collectible, coin, challenge, streak, and efficiency progress", () => {
  const statistics = getGuestStatistics({
    records: {},
    engagement: {
      coins: 75,
      rewardedCollectibles: ["5:golden:golden-5", "10:treasure:treasure-10"],
      rewardedEfficientLevels: [5, 6],
      daily: {
        completions: { "2026-03-01": true, "2026-03-02": true },
        lastCompletedDate: "2026-03-02",
        currentStreak: 2,
        longestStreak: 4,
      },
    },
  });

  assert.equal(statistics.totalGoldenApples, 1);
  assert.equal(statistics.totalTreasures, 1);
  assert.equal(statistics.guestCoins, 75);
  assert.equal(statistics.dailyChallengesCompleted, 2);
  assert.equal(statistics.currentDailyStreak, 2);
  assert.equal(statistics.longestDailyStreak, 4);
  assert.equal(statistics.efficientLevels, 2);
});

test("derives partial progression, performance, apples and achievements from saved records", () => {
  const records = {
    1: { score: 120, moves: 8, stars: 3 },
    2: { score: 220, moves: 11, stars: 2 },
    3: { score: 180, moves: 14, stars: 3 },
  };
  const statistics = getGuestStatistics({
    records,
    achievements: {
      "first-apple": { unlockedAt: "2026-11-07T10:00:00.000Z" },
      "getting-started": { unlockedAt: null },
    },
  });

  assert.equal(statistics.completedLevels, 3);
  assert.equal(statistics.remainingLevels, 97);
  assert.equal(statistics.completionPercentage, 3);
  assert.equal(statistics.totalStars, 8);
  assert.equal(
    statistics.totalApples,
    levels.slice(0, 3).reduce((total, level) => total + level.board.apples.length, 0),
  );
  assert.equal(statistics.totalRecordedMoves, 33);
  assert.equal(statistics.highestScore, 220);
  assert.equal(statistics.averageScore, 520 / 3);
  assert.deepEqual(statistics.bestPerformingLevel, {
    levelNumber: 3,
    score: 180,
    moves: 14,
    stars: 3,
  });
  assert.equal(statistics.highestScoringLevel, 2);
  assert.equal(statistics.totalAchievements, ACHIEVEMENT_CATALOG.length);
  assert.equal(statistics.unlockedAchievements, 1);
  assert.equal(statistics.recentAchievements[0].id, "first-apple");
  assert.deepEqual(statistics.recentLevels.map(({ levelNumber }) => levelNumber), [3, 2, 1]);
  assert.deepEqual(
    statistics.scoreRecords.map(({ levelNumber }) => levelNumber),
    [1, 2, 3],
  );
  assert.equal(statistics.maximumScore, 220);
});

test("summarizes all 100 continuous levels and caps score visualization to the latest 12", () => {
  const records = recordsForLevels(TOTAL_LEVELS);
  const statistics = getGuestStatistics({ records });

  assert.equal(statistics.completedLevels, 100);
  assert.equal(statistics.remainingLevels, 0);
  assert.equal(statistics.completionPercentage, 100);
  assert.equal(statistics.totalStars, 199);
  assert.equal(
    statistics.totalApples,
    levels.reduce((total, level) => total + level.board.apples.length, 0),
  );
  assert.equal(statistics.totalRecordedMoves, 15150);
  assert.equal(statistics.highestScore, 10000);
  assert.equal(statistics.averageScore, 5050);
  assert.equal(statistics.unlockedAchievements, 11);
  assert.equal(statistics.totalAchievements, ACHIEVEMENT_CATALOG.length);
  assert.equal(statistics.scoreRecords.length, 12);
  assert.equal(statistics.scoreRecords[0].levelNumber, 89);
  assert.equal(statistics.scoreRecords.at(-1).levelNumber, 100);
  assert.deepEqual(
    statistics.recentLevels.map(({ levelNumber }) => levelNumber),
    [100, 99, 98, 97, 96],
  );
});

test("ignores incomplete, malformed, and out-of-range records without inventing totals", () => {
  const statistics = getGuestStatistics({
    records: {
      1: { score: 90, moves: 10, stars: 2 },
      2: { score: 25, moves: 5 },
      101: { score: 999, moves: 1, stars: 3 },
      invalid: { score: 100, moves: 10, stars: 3 },
    },
  });

  assert.equal(statistics.completedLevels, 1);
  assert.equal(statistics.totalStars, 2);
  assert.equal(statistics.totalRecordedMoves, 10);
  assert.equal(statistics.highestScore, 90);
  assert.equal(statistics.averageScore, 90);
  assert.equal(statistics.totalApples, levels[0].board.apples.length);
});
