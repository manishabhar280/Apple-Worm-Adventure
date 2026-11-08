import { levels, TOTAL_LEVELS } from "./levelData.js";
import { recordLevelCompletion } from "../game/levelProgression.js";
import {
  isValidGuestAchievementUnlocks,
  persistGuestAchievementUnlocks,
} from "../game/guestAchievements.js";
import { replayGameActions } from "../../../shared/gameLogic.js";
import { getLevelFeatureBoard, FEATURE_REWARDS } from "../../../shared/levelFeatures.js";
import {
  getDailyChallenge,
  isUtcDateKey,
  recordDailyChallengeCompletion,
  toUtcDateKey,
} from "../game/dailyChallenge.js";
import { WORM_SKINS } from "../game/wormSkins.js";

export const GUEST_PROGRESS_STORAGE_KEY = "apple-worm-adventure.guest-progress";
export const GUEST_PROGRESS_VERSION = 1;

export function createDefaultGuestProgress() {
  return {
    version: GUEST_PROGRESS_VERSION,
    unlockedLevel: 1,
    records: {},
    activeGame: null,
    settings: { reducedMotion: false },
    achievements: {},
    engagement: createDefaultEngagement(),
  };
}

export function createDefaultEngagement() {
  return {
    coins: 0,
    rewardedCollectibles: [],
    rewardedEfficientLevels: [],
    daily: {
      completions: {},
      lastCompletedDate: null,
      currentStreak: 0,
      longestStreak: 0,
    },
    selectedSkin: "classic",
  };
}

function hasRequiredKeys(value, requiredKeys, allowedKeys) {
  const keys = Object.keys(value);
  return requiredKeys.every((key) => keys.includes(key)) &&
    keys.every((key) => allowedKeys.includes(key));
}

function hasOnlyKeys(value, allowedKeys) {
  return hasRequiredKeys(value, allowedKeys, allowedKeys);
}

function isValidRecord(record) {
  return record !== null &&
    typeof record === "object" &&
    hasOnlyKeys(record, ["score", "moves", "stars"]) &&
    Number.isSafeInteger(record.score) &&
    record.score >= 0 &&
    Number.isInteger(record.moves) &&
    record.moves >= 0 &&
    record.moves <= 2000 &&
    Number.isInteger(record.stars) &&
    record.stars >= 1 &&
    record.stars <= 3;
}

function isValidEngagement(value) {
  const allowedSkinIds = new Set(WORM_SKINS.map(({ id }) => id));
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !hasOnlyKeys(
      value,
      ["coins", "rewardedCollectibles", "rewardedEfficientLevels", "daily", "selectedSkin"],
    ) ||
    !Number.isSafeInteger(value.coins) ||
    value.coins < 0 ||
    !Array.isArray(value.rewardedCollectibles) ||
    new Set(value.rewardedCollectibles).size !== value.rewardedCollectibles.length ||
    !Array.isArray(value.rewardedEfficientLevels) ||
    new Set(value.rewardedEfficientLevels).size !== value.rewardedEfficientLevels.length ||
    value.rewardedEfficientLevels.some((level) =>
      !Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) ||
    !allowedSkinIds.has(value.selectedSkin) ||
    value.daily === null ||
    typeof value.daily !== "object" ||
    Array.isArray(value.daily) ||
    !hasOnlyKeys(
      value.daily,
      ["completions", "lastCompletedDate", "currentStreak", "longestStreak"],
    ) ||
    value.daily.completions === null ||
    typeof value.daily.completions !== "object" ||
    Array.isArray(value.daily.completions) ||
    Object.entries(value.daily.completions).some(([date, completed]) =>
      !isUtcDateKey(date) || completed !== true) ||
    !Number.isSafeInteger(value.daily.currentStreak) ||
    value.daily.currentStreak < 0 ||
    !Number.isSafeInteger(value.daily.longestStreak) ||
    value.daily.longestStreak < value.daily.currentStreak ||
    !(
      value.daily.lastCompletedDate === null ||
      isUtcDateKey(value.daily.lastCompletedDate)
    ) ||
    (value.daily.lastCompletedDate !== null &&
      !Object.hasOwn(value.daily.completions, value.daily.lastCompletedDate)) ||
    (value.daily.lastCompletedDate === null && value.daily.currentStreak !== 0)
  ) {
    return false;
  }

  const validRewards = new Set();
  for (const level of levels) {
    const board = getLevelFeatureBoard(level);
    for (const item of board.goldenApples ?? []) {
      validRewards.add(`${level.number}:golden:${item.id}`);
    }
    for (const item of board.treasures ?? []) {
      validRewards.add(`${level.number}:treasure:${item.id}`);
    }
  }
  return value.rewardedCollectibles.every((reward) => validRewards.has(reward));
}

export function isValidGuestProgress(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    !hasRequiredKeys(
      value,
      ["version", "unlockedLevel", "records", "activeGame", "settings"],
      ["version", "unlockedLevel", "records", "activeGame", "settings", "achievements", "engagement"],
    ) ||
    value.version !== GUEST_PROGRESS_VERSION ||
    !Number.isInteger(value.unlockedLevel) ||
    value.unlockedLevel < 1 ||
    value.unlockedLevel > TOTAL_LEVELS ||
    value.records === null ||
    typeof value.records !== "object" ||
    Array.isArray(value.records) ||
    value.settings === null ||
    typeof value.settings !== "object" ||
    !hasRequiredKeys(value.settings, ["reducedMotion"], ["reducedMotion"]) ||
    typeof value.settings.reducedMotion !== "boolean" ||
    (Object.hasOwn(value, "achievements") &&
      !isValidGuestAchievementUnlocks(value.achievements)) ||
    (Object.hasOwn(value, "engagement") &&
      !isValidEngagement(value.engagement))
  ) {
    return false;
  }

  const completedLevels = Object.keys(value.records)
    .map(Number)
    .sort((left, right) => left - right);
  if (
    completedLevels.some((levelNumber, index) =>
      levelNumber !== index + 1 ||
      !isValidRecord(value.records[String(levelNumber)])) ||
    value.unlockedLevel !== Math.min(TOTAL_LEVELS, completedLevels.length + 1)
  ) {
    return false;
  }

  if (value.activeGame === null) return true;
  if (
    typeof value.activeGame !== "object" ||
    !hasRequiredKeys(
      value.activeGame,
      ["levelNumber", "actions"],
      ["levelNumber", "actions", "challengeDate"],
    ) ||
    !Number.isInteger(value.activeGame.levelNumber) ||
    value.activeGame.levelNumber < 1 ||
    !Array.isArray(value.activeGame.actions) ||
    value.activeGame.actions.length > 2000 ||
    value.activeGame.actions.some((action) =>
      !["up", "down", "left", "right"].includes(action))
  ) {
    return false;
  }

  const challengeDate = value.activeGame.challengeDate;
  if (
    (challengeDate !== undefined &&
      (!isUtcDateKey(challengeDate) ||
        getDailyChallenge(challengeDate).levelNumber !== value.activeGame.levelNumber)) ||
    (value.activeGame.levelNumber > value.unlockedLevel &&
      challengeDate === undefined)
  ) {
    return false;
  }

  try {
    const level = levels[value.activeGame.levelNumber - 1];
    replayGameActions(
      getLevelFeatureBoard(level),
      value.activeGame.actions,
      level.moveLimit,
      { strict: true },
    );
    return true;
  } catch {
    return false;
  }
}

export function readGuestProgress(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const serialized = target.getItem(GUEST_PROGRESS_STORAGE_KEY);
    if (serialized === null) {
      return { progress: createDefaultGuestProgress(), canSave: true, error: "" };
    }

    const progress = JSON.parse(serialized);
    if (!isValidGuestProgress(progress)) {
      return {
        progress: createDefaultGuestProgress(),
        canSave: false,
        error: "Saved guest progress is invalid or from an unsupported version. It was left unchanged.",
      };
    }
    return { progress, canSave: true, error: "" };
  } catch {
    return {
      progress: createDefaultGuestProgress(),
      canSave: false,
      error: "Guest progress could not be read from this browser. You can play, but progress may not be saved.",
    };
  }
}

export function saveGuestProgress(progress, storage) {
  if (!isValidGuestProgress(progress)) {
    throw new Error("Guest progress could not be saved because its data is invalid.");
  }
  const target = storage ?? globalThis.localStorage;
  target.setItem(GUEST_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function completeGuestLevel(
  progress,
  level,
  game,
  earnedAt = new Date().toISOString(),
) {
  if (
    game.status !== "won" ||
    !Number.isInteger(level.number) ||
    level.number < 1 ||
    level.number > progress.unlockedLevel
  ) {
    return progress;
  }

  const records = recordLevelCompletion(progress.records, level, game);
  const { unlocks: achievements } = persistGuestAchievementUnlocks(
    records,
    progress.records,
    progress.achievements,
    earnedAt,
    progress.engagement,
    progress.engagement,
  );
  const unlockedLevel = Math.max(
    progress.unlockedLevel,
    Math.min(TOTAL_LEVELS, level.number + 1),
  );
  if (
    records === progress.records &&
    unlockedLevel === progress.unlockedLevel &&
    progress.activeGame === null &&
    achievements === progress.achievements
  ) {
    return progress;
  }

  return {
    ...progress,
    unlockedLevel,
    records,
    activeGame: null,
    achievements,
  };
}

export function completeGuestLevelWithFeatures(
  progress,
  level,
  game,
  {
    challengeDate = null,
    today = toUtcDateKey(),
    earnedAt = new Date().toISOString(),
  } = {},
) {
  if (game.status !== "won") return progress;

  const originalEngagement = progress.engagement ?? createDefaultEngagement();
  let next = completeGuestLevel(progress, level, game, earnedAt);
  const board = getLevelFeatureBoard(level);
  const rewardedCollectibles = new Set(originalEngagement.rewardedCollectibles);
  let coins = originalEngagement.coins;
  const canRecordLevel = level.number <= progress.unlockedLevel;
  for (const id of canRecordLevel ? game.collectedGoldenAppleIds ?? [] : []) {
    if (!(board.goldenApples ?? []).some((item) => item.id === id)) continue;
    const rewardId = `${level.number}:golden:${id}`;
    if (!rewardedCollectibles.has(rewardId)) {
      rewardedCollectibles.add(rewardId);
      coins = Math.min(Number.MAX_SAFE_INTEGER, coins + FEATURE_REWARDS.goldenApple);
    }
  }
  for (const id of canRecordLevel ? game.collectedTreasureIds ?? [] : []) {
    if (!(board.treasures ?? []).some((item) => item.id === id)) continue;
    const rewardId = `${level.number}:treasure:${id}`;
    if (!rewardedCollectibles.has(rewardId)) {
      rewardedCollectibles.add(rewardId);
      coins = Math.min(Number.MAX_SAFE_INTEGER, coins + FEATURE_REWARDS.treasure);
    }
  }

  const rewardedEfficientLevels = new Set(originalEngagement.rewardedEfficientLevels);
  if (
    canRecordLevel &&
    game.moves <= level.parMoves &&
    !rewardedEfficientLevels.has(level.number)
  ) {
    rewardedEfficientLevels.add(level.number);
    coins = Math.min(Number.MAX_SAFE_INTEGER, coins + FEATURE_REWARDS.efficientCompletion);
  }

  let daily = originalEngagement.daily;
  if (
    challengeDate === today &&
    isUtcDateKey(challengeDate) &&
    getDailyChallenge(challengeDate).levelNumber === level.number
  ) {
    const completion = recordDailyChallengeCompletion(daily, challengeDate);
    daily = completion.daily;
    coins = Math.min(Number.MAX_SAFE_INTEGER, coins + completion.reward);
  }

  const engagement = {
    ...originalEngagement,
    coins,
    rewardedCollectibles: [...rewardedCollectibles].sort(),
    rewardedEfficientLevels: [...rewardedEfficientLevels].sort((a, b) => a - b),
    daily,
  };
  const achievements = persistGuestAchievementUnlocks(
    next.records,
    progress.records,
    next.achievements ?? progress.achievements ?? {},
    earnedAt,
    engagement,
    originalEngagement,
  ).unlocks;
  const sameRewards =
    coins === originalEngagement.coins &&
    rewardedCollectibles.size === originalEngagement.rewardedCollectibles.length &&
    originalEngagement.rewardedCollectibles.every((id) => rewardedCollectibles.has(id)) &&
    rewardedEfficientLevels.size === originalEngagement.rewardedEfficientLevels.length &&
    originalEngagement.rewardedEfficientLevels.every((id) => rewardedEfficientLevels.has(id)) &&
    daily === originalEngagement.daily;
  if (
    next === progress &&
    sameRewards &&
    progress.activeGame === null &&
    progress.engagement === originalEngagement &&
    achievements === progress.achievements
  ) {
    return progress;
  }
  next = {
    ...next,
    activeGame: null,
    engagement,
    achievements,
  };
  return next;
}
