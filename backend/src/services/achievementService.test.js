import assert from "node:assert/strict";
import test from "node:test";
import { achievementDefinitions, createAchievementService } from "./achievementService.js";

function makeQuery(value) {
  return {
    sort() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

test("achievement progress is derived from validated game records and unlocks at thresholds", async () => {
  const userId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const sessions = [
    { status: "completed", applesCollected: 3 },
    { status: "completed", applesCollected: 2 },
    { status: "completed", applesCollected: 1 },
    { status: "failed", applesCollected: 0 },
    { status: "completed", applesCollected: 4 },
  ].map((session, index) => ({ ...session, user: userId, startedAt: new Date(index * 1000) }));
  const progressRecords = [
    { status: "completed", stars: 3 },
    { status: "completed", stars: 3 },
    { status: "completed", stars: 3 },
    { status: "completed", stars: 1 },
    { status: "unlocked", stars: 0 },
  ].map((record) => ({ ...record, user: userId }));
  const achievements = [];
  let nextId = 1;
  const AchievementModel = {
    find(filter) {
      return makeQuery(achievements.filter((record) => record.user === String(filter.user)));
    },
    async create(values) {
      const record = {
        ...values,
        _id: String(nextId++).padStart(24, "0"),
        save: async () => record,
      };
      achievements.push(record);
      return record;
    },
  };
  const service = createAchievementService({
    AchievementModel,
    GameSessionModel: { find: () => makeQuery(sessions) },
    LevelProgressModel: { find: () => makeQuery(progressRecords) },
    now: () => new Date("2026-11-03T12:00:00.000Z"),
  });

  const result = await service.updateProgress({ _id: userId });
  const byKey = new Map(result.map((achievement) => [achievement.key, achievement]));
  assert.equal(result.length, achievementDefinitions.length);
  assert.ok(result.length >= 10);
  assert.equal(byKey.get("first-level").unlocked, true);
  assert.equal(byKey.get("ten-apples").progress, 10);
  assert.equal(byKey.get("ten-apples").unlocked, true);
  assert.equal(byKey.get("ten-stars").unlocked, true);
  assert.equal(byKey.get("three-win-streak").progress, 3);
  assert.equal(byKey.get("three-win-streak").unlocked, true);
  assert.equal(byKey.get("five-win-streak").unlocked, false);
  assert.equal(byKey.get("perfect-level").unlocked, true);

  const firstUnlockDate = byKey.get("ten-apples").unlockedAt;
  const repeated = await service.updateProgress({ _id: userId });
  assert.equal(repeated.find((achievement) => achievement.key === "ten-apples").unlockedAt, firstUnlockDate);
  assert.equal(achievements.length, achievementDefinitions.length);
});
