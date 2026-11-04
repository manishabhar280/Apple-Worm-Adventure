import Achievement from "../models/Achievement.js";
import GameSession from "../models/GameSession.js";
import LevelProgress from "../models/LevelProgress.js";

export const achievementDefinitions = [
  { key: "first-level", title: "First Steps", description: "Complete your first level.", icon: "🌱", metric: "completedLevels", target: 1 },
  { key: "five-levels", title: "Orchard Explorer", description: "Complete 5 different levels.", icon: "🧭", metric: "completedLevels", target: 5 },
  { key: "twenty-five-levels", title: "Worm Wanderer", description: "Complete 25 different levels.", icon: "🐛", metric: "completedLevels", target: 25 },
  { key: "ten-apples", title: "Apple Picker", description: "Collect 10 apples across your adventures.", icon: "🍎", metric: "applesCollected", target: 10 },
  { key: "fifty-apples", title: "Apple Gatherer", description: "Collect 50 apples across your adventures.", icon: "🧺", metric: "applesCollected", target: 50 },
  { key: "one-hundred-apples", title: "Orchard Keeper", description: "Collect 100 apples across your adventures.", icon: "🌳", metric: "applesCollected", target: 100 },
  { key: "ten-stars", title: "Star Seeker", description: "Earn 10 stars on completed levels.", icon: "⭐", metric: "starsEarned", target: 10 },
  { key: "fifty-stars", title: "Star Collector", description: "Earn 50 stars on completed levels.", icon: "🌟", metric: "starsEarned", target: 50 },
  { key: "one-hundred-stars", title: "Star Master", description: "Earn 100 stars on completed levels.", icon: "✨", metric: "starsEarned", target: 100 },
  { key: "three-win-streak", title: "Triple Treat", description: "Win 3 levels in a row.", icon: "🔥", metric: "bestWinStreak", target: 3 },
  { key: "five-win-streak", title: "Unstoppable", description: "Win 5 levels in a row.", icon: "🏅", metric: "bestWinStreak", target: 5 },
  { key: "perfect-level", title: "Perfect Path", description: "Earn 3 stars on a completed level.", icon: "💎", metric: "threeStarLevels", target: 1 },
];

function serializeAchievement(achievement) {
  return {
    id: String(achievement._id),
    key: achievement.key,
    title: achievement.title,
    description: achievement.description,
    icon: achievement.icon,
    progress: achievement.progress,
    target: achievement.target,
    unlocked: Boolean(achievement.unlockedAt),
    unlockedAt: achievement.unlockedAt,
  };
}

export function createAchievementService({
  AchievementModel = Achievement,
  GameSessionModel = GameSession,
  LevelProgressModel = LevelProgress,
  now = () => new Date(),
} = {}) {
  async function updateProgress(user) {
    const userId = String(user._id ?? user);
    const [sessions, levelProgress, existing] = await Promise.all([
      GameSessionModel.find({ user: userId }).sort({ startedAt: 1 }),
      LevelProgressModel.find({ user: userId }),
      AchievementModel.find({ user: userId }),
    ]);

    const completed = levelProgress.filter((record) => record.status === "completed");
    let currentStreak = 0;
    let bestWinStreak = 0;
    for (const session of sessions) {
      if (session.status === "completed") {
        currentStreak += 1;
        bestWinStreak = Math.max(bestWinStreak, currentStreak);
      } else if (session.status === "failed") {
        currentStreak = 0;
      }
    }

    const metrics = {
      completedLevels: completed.length,
      applesCollected: sessions.reduce((total, session) => total + session.applesCollected, 0),
      starsEarned: completed.reduce((total, record) => total + record.stars, 0),
      bestWinStreak,
      threeStarLevels: completed.some((record) => record.stars === 3) ? 1 : 0,
    };
    const recordsByKey = new Map(existing.map((record) => [record.key, record]));
    const unlockedAt = now();

    for (const definition of achievementDefinitions) {
      const progress = Math.min(metrics[definition.metric], definition.target);
      const unlocked = progress >= definition.target;
      const values = {
        title: definition.title,
        description: definition.description,
        icon: definition.icon,
        progress,
        target: definition.target,
        unlockedAt: recordsByKey.get(definition.key)?.unlockedAt || (unlocked ? unlockedAt : null),
      };
      const record = recordsByKey.get(definition.key);
      if (record) {
        Object.assign(record, values);
        await record.save();
      } else {
        await AchievementModel.create({
          user: userId,
          key: definition.key,
          ...values,
        });
      }
    }

    const achievements = await AchievementModel.find({ user: userId });
    const refreshedByKey = new Map(achievements.map((record) => [record.key, record]));
    return achievementDefinitions.map((definition) =>
      serializeAchievement(refreshedByKey.get(definition.key)),
    );
  }

  return { updateProgress };
}
