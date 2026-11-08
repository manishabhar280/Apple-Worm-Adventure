import { TOTAL_LEVELS, levels } from "../data/levelData.js";
import { getGuestAchievements } from "./guestAchievements.js";

function isRecord(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Number.isSafeInteger(value.score) &&
    value.score >= 0 &&
    Number.isInteger(value.moves) &&
    value.moves >= 0 &&
    Number.isInteger(value.stars) &&
    value.stars >= 1 &&
    value.stars <= 3;
}

function getCompletedRecords(records) {
  if (records === null || typeof records !== "object" || Array.isArray(records)) {
    return [];
  }
  return levels.flatMap((level) => {
    const record = records[level.number];
    return isRecord(record)
      ? [{ levelNumber: level.number, record }]
      : [];
  });
}

export function getGuestStatistics(progress = {}) {
  const completedRecords = getCompletedRecords(progress?.records);
  const records = Object.fromEntries(
    completedRecords.map(({ levelNumber, record }) => [levelNumber, record]),
  );
  const completedLevels = completedRecords.length;
  const scoreTotal = completedRecords.reduce(
    (total, { record }) => total + record.score,
    0,
  );
  const achievements = getGuestAchievements(
    records,
    progress?.achievements ?? {},
    progress?.engagement ?? {},
  );
  const unlockedAchievements = achievements.filter(({ unlocked }) => unlocked);
  const recentAchievements = achievements
    .filter(({ unlocked, unlockedAt }) => unlocked && unlockedAt)
    .sort((first, second) =>
      Date.parse(second.unlockedAt) - Date.parse(first.unlockedAt))
    .slice(0, 4);
  const bestPerforming = [...completedRecords].sort((first, second) =>
    second.record.stars - first.record.stars ||
    second.record.score - first.record.score ||
    first.record.moves - second.record.moves ||
    first.levelNumber - second.levelNumber)[0] ?? null;
  const highestScoring = [...completedRecords].sort((first, second) =>
    second.record.score - first.record.score ||
    second.record.stars - first.record.stars ||
    first.record.moves - second.record.moves ||
    first.levelNumber - second.levelNumber)[0] ?? null;
  const scoreRecords = completedRecords.slice(-12).map(({ levelNumber, record }) => ({
    levelNumber,
    score: record.score,
  }));
  const recentLevels = [...completedRecords].reverse().slice(0, 5).map(
    ({ levelNumber, record }) => ({
      levelNumber,
      ...record,
    }),
  );

  return {
    completedLevels,
    remainingLevels: TOTAL_LEVELS - completedLevels,
    completionPercentage: Math.round((completedLevels / TOTAL_LEVELS) * 100),
    totalStars: completedRecords.reduce(
      (total, { record }) => total + record.stars,
      0,
    ),
    totalGoldenApples: (progress?.engagement?.rewardedCollectibles ?? [])
      .filter((id) => id.includes(":golden:"))
      .length,
    totalTreasures: (progress?.engagement?.rewardedCollectibles ?? [])
      .filter((id) => id.includes(":treasure:"))
      .length,
    guestCoins: progress?.engagement?.coins ?? 0,
    dailyChallengesCompleted: Object.keys(
      progress?.engagement?.daily?.completions ?? {},
    ).length,
    currentDailyStreak: progress?.engagement?.daily?.currentStreak ?? 0,
    longestDailyStreak: progress?.engagement?.daily?.longestStreak ?? 0,
    efficientLevels: (progress?.engagement?.rewardedEfficientLevels ?? []).length,
    totalApples: completedRecords.reduce(
      (total, { levelNumber }) =>
        total + levels[levelNumber - 1].board.apples.length,
      0,
    ),
    totalRecordedMoves: completedRecords.reduce(
      (total, { record }) => total + record.moves,
      0,
    ),
    highestScore: completedRecords.reduce(
      (highest, { record }) => Math.max(highest, record.score),
      0,
    ),
    highestScoringLevel: highestScoring
      ? highestScoring.levelNumber
      : null,
    averageScore: completedLevels > 0 ? scoreTotal / completedLevels : null,
    bestPerformingLevel: bestPerforming
      ? {
          levelNumber: bestPerforming.levelNumber,
          ...bestPerforming.record,
        }
      : null,
    totalAchievements: achievements.length,
    unlockedAchievements: unlockedAchievements.length,
    recentAchievements,
    recentLevels,
    scoreRecords,
    maximumScore: scoreRecords.reduce(
      (maximum, { score }) => Math.max(maximum, score),
      0,
    ),
  };
}
