import { TOTAL_LEVELS } from "../../../shared/levelData.js";
import { FEATURE_REWARDS } from "../../../shared/levelFeatures.js";

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const EPOCH_DAY = Date.UTC(2025, 0, 1) / DAY_MILLISECONDS;

export function toUtcDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("A valid date is required for the daily challenge.");
  }
  return date.toISOString().slice(0, 10);
}

export function isUtcDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && toUtcDateKey(date) === value;
}

export function getDailyChallenge(value = new Date()) {
  const date = typeof value === "string" ? value : toUtcDateKey(value);
  if (!isUtcDateKey(date)) {
    throw new Error("The daily challenge date must be a valid UTC calendar date.");
  }
  const dayNumber = Date.parse(`${date}T00:00:00.000Z`) / DAY_MILLISECONDS;
  return Object.freeze({
    date,
    levelNumber: ((dayNumber - EPOCH_DAY) % TOTAL_LEVELS + TOTAL_LEVELS) % TOTAL_LEVELS + 1,
    reward: FEATURE_REWARDS.dailyChallenge,
    objective: "Complete the featured level to earn today's local bonus.",
  });
}

export function getPreviousUtcDate(date) {
  if (!isUtcDateKey(date)) {
    throw new Error("A valid UTC calendar date is required.");
  }
  return toUtcDateKey(new Date(Date.parse(`${date}T00:00:00.000Z`) - DAY_MILLISECONDS));
}

export function recordDailyChallengeCompletion(daily = {}, challengeDate) {
  if (!isUtcDateKey(challengeDate)) {
    throw new Error("A valid UTC challenge date is required.");
  }
  const completions = daily.completions ?? {};
  if (Object.hasOwn(completions, challengeDate)) {
    return {
      daily,
      completedNew: false,
      reward: 0,
    };
  }

  const previousDate = daily.lastCompletedDate;
  const isConsecutive = previousDate === getPreviousUtcDate(challengeDate);
  const currentStreak = isConsecutive ? (daily.currentStreak ?? 0) + 1 : 1;
  const isNewerDate = !previousDate || challengeDate > previousDate;
  const nextDaily = {
    completions: { ...completions, [challengeDate]: true },
    lastCompletedDate: isNewerDate ? challengeDate : previousDate,
    currentStreak: isNewerDate ? currentStreak : daily.currentStreak ?? 0,
    longestStreak: Math.max(daily.longestStreak ?? 0, currentStreak),
  };
  return {
    daily: nextDaily,
    completedNew: true,
    reward: FEATURE_REWARDS.dailyChallenge,
  };
}
