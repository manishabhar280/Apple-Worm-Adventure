import { levels } from "../data/levelData.js";
import { getUnlockedWormSkins } from "./wormSkins.js";

export const ACHIEVEMENT_CATALOG = [
  {
    id: "first-apple",
    title: "First Apple",
    description: "Complete your first level.",
    icon: "🍎",
    metric: "completedLevels",
    target: 1,
  },
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Complete 5 levels in your continuous adventure.",
    icon: "🌱",
    metric: "completedLevels",
    target: 5,
  },
  {
    id: "puzzle-explorer",
    title: "Puzzle Explorer",
    description: "Complete 25 different levels.",
    icon: "🧭",
    metric: "completedLevels",
    target: 25,
  },
  {
    id: "halfway-hero",
    title: "Halfway Hero",
    description: "Complete 50 levels on the journey.",
    icon: "⭐",
    metric: "completedLevels",
    target: 50,
  },
  {
    id: "orchard-champion",
    title: "Orchard Champion",
    description: "Complete all 100 levels.",
    icon: "🏆",
    metric: "completedLevels",
    target: 100,
  },
  {
    id: "star-collector",
    title: "Star Collector",
    description: "Earn 10 stars across completed levels.",
    icon: "🌟",
    metric: "starsEarned",
    target: 10,
  },
  {
    id: "star-master",
    title: "Star Master",
    description: "Earn 50 stars across completed levels.",
    icon: "✨",
    metric: "starsEarned",
    target: 50,
  },
  {
    id: "perfect-thinker",
    title: "Perfect Thinker",
    description: "Earn a three-star result on 5 different levels.",
    icon: "💎",
    metric: "perfectLevels",
    target: 5,
  },
  {
    id: "apple-collector",
    title: "Apple Collector",
    description: "Collect 25 apples by completing levels.",
    icon: "🧺",
    metric: "applesCollected",
    target: 25,
  },
  {
    id: "apple-master",
    title: "Apple Master",
    description: "Collect 100 apples by completing levels.",
    icon: "🍏",
    metric: "applesCollected",
    target: 100,
  },
  {
    id: "golden-collector",
    title: "Golden Collector",
    description: "Claim a Golden Apple reward.",
    icon: "🌟",
    metric: "goldenApples",
    target: 1,
  },
  {
    id: "treasure-finder",
    title: "Treasure Finder",
    description: "Discover a hidden treasure chest.",
    icon: "🧰",
    metric: "treasures",
    target: 1,
  },
  {
    id: "daily-adventurer",
    title: "Daily Adventurer",
    description: "Complete a daily challenge.",
    icon: "📅",
    metric: "dailyChallenges",
    target: 1,
  },
  {
    id: "three-day-streak",
    title: "Three-Day Streak",
    description: "Complete daily challenges on three consecutive days.",
    icon: "🔥",
    metric: "longestDailyStreak",
    target: 3,
  },
  {
    id: "seven-day-streak",
    title: "Seven-Day Streak",
    description: "Complete daily challenges on seven consecutive days.",
    icon: "🏅",
    metric: "longestDailyStreak",
    target: 7,
  },
  {
    id: "skin-collector",
    title: "Worm Wardrobe",
    description: "Unlock every cosmetic worm skin.",
    icon: "🎨",
    metric: "unlockedSkins",
    target: 5,
  },
  {
    id: "efficient-worm",
    title: "Efficient Worm",
    description: "Finish a level within its move target.",
    icon: "⚡",
    metric: "efficientLevels",
    target: 1,
  },
];

function getMetrics(records, engagement) {
  const completedEntries = Object.entries(records);
  const completedLevels = completedEntries.length;
  const starsEarned = completedEntries.reduce(
    (total, [, record]) => total + record.stars,
    0,
  );
  const perfectLevels = completedEntries.filter(([, record]) => record.stars === 3)
    .length;
  const applesCollected = completedEntries.reduce((total, [levelNumber]) => {
    const level = levels[Number(levelNumber) - 1];
    return total + (level?.board.apples.length ?? 0);
  }, 0);
  const rewardedCollectibles = engagement?.rewardedCollectibles ?? [];
  const dailyCompletions = engagement?.daily?.completions ?? {};
  return {
    completedLevels,
    starsEarned,
    perfectLevels,
    applesCollected,
    goldenApples: rewardedCollectibles.filter((id) => id.includes(":golden:")).length,
    treasures: rewardedCollectibles.filter((id) => id.includes(":treasure:")).length,
    dailyChallenges: Object.keys(dailyCompletions).length,
    longestDailyStreak: engagement?.daily?.longestStreak ?? 0,
    unlockedSkins: getUnlockedWormSkins(records).length,
    efficientLevels: engagement?.rewardedEfficientLevels?.length ?? 0,
  };
}

export function getGuestAchievements(records = {}, unlocks = {}, engagement = {}) {
  const metrics = getMetrics(records, engagement);
  return ACHIEVEMENT_CATALOG.map((achievement) => {
    const progress = Math.min(metrics[achievement.metric] ?? 0, achievement.target);
    const unlocked = progress >= achievement.target;
    return {
      ...achievement,
      progress,
      unlocked,
      unlockedAt: unlocked ? unlocks[achievement.id]?.unlockedAt ?? null : null,
    };
  });
}

export function isValidGuestAchievementUnlocks(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const knownIds = new Set(ACHIEVEMENT_CATALOG.map(({ id }) => id));
  return Object.entries(value).every(([id, unlock]) =>
    knownIds.has(id) &&
    unlock !== null &&
    typeof unlock === "object" &&
    !Array.isArray(unlock) &&
    Object.keys(unlock).length === 1 &&
    Object.hasOwn(unlock, "unlockedAt") &&
    (unlock.unlockedAt === null ||
      (typeof unlock.unlockedAt === "string" &&
        Number.isFinite(Date.parse(unlock.unlockedAt)) &&
        new Date(unlock.unlockedAt).toISOString() === unlock.unlockedAt)));
}

export function persistGuestAchievementUnlocks(
  records,
  previousRecords,
  unlocks = {},
  earnedAt = new Date().toISOString(),
  engagement = {},
  previousEngagement = {},
) {
  const priorAchievements = getGuestAchievements(
    previousRecords,
    unlocks,
    previousEngagement,
  );
  const currentAchievements = getGuestAchievements(records, unlocks, engagement);
  const unlockMap = { ...unlocks };
  const newlyUnlocked = [];
  let changed = false;

  for (const achievement of currentAchievements) {
    if (!achievement.unlocked || Object.hasOwn(unlockMap, achievement.id)) continue;
    const wasUnlocked = priorAchievements.find(({ id }) => id === achievement.id)?.unlocked;
    unlockMap[achievement.id] = {
      unlockedAt: wasUnlocked ? null : earnedAt,
    };
    if (!wasUnlocked) newlyUnlocked.push(achievement.id);
    changed = true;
  }

  return {
    unlocks: changed ? unlockMap : unlocks,
    newlyUnlocked,
  };
}
