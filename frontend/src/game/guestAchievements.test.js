import assert from "node:assert/strict";
import test from "node:test";
import {
  ACHIEVEMENT_CATALOG,
  getGuestAchievements,
  isValidGuestAchievementUnlocks,
  persistGuestAchievementUnlocks,
} from "./guestAchievements.js";
import { levels } from "../data/levelData.js";

function recordsForLevels(count, stars = 1) {
  return Object.fromEntries(
    levels.slice(0, count).map((level) => [
      level.number,
      { score: 100, moves: level.parMoves, stars },
    ]),
  );
}

function achievement(achievements, id) {
  return achievements.find((item) => item.id === id);
}

test("catalog defines the continuous level, star, perfect-score, and apple milestones", () => {
  assert.equal(ACHIEVEMENT_CATALOG.length, 17);
  assert.deepEqual(
    ACHIEVEMENT_CATALOG.slice(0, 5).map(({ target }) => target),
    [1, 5, 25, 50, 100],
  );
  assert.ok(ACHIEVEMENT_CATALOG.every(({ id, title, description, icon, target }) =>
    id && title && description && icon && target > 0));
  assert.deepEqual(
    ACHIEVEMENT_CATALOG.slice(10).map(({ id }) => id),
    [
      "golden-collector",
      "treasure-finder",
      "daily-adventurer",
      "three-day-streak",
      "seven-day-streak",
      "skin-collector",
      "efficient-worm",
    ],
  );
});

test("calculates every level-completion milestone from unique level records", () => {
  const achievements = getGuestAchievements(recordsForLevels(100));
  assert.equal(achievement(achievements, "first-apple").progress, 1);
  assert.equal(achievement(achievements, "getting-started").unlocked, true);
  assert.equal(achievement(achievements, "puzzle-explorer").unlocked, true);
  assert.equal(achievement(achievements, "halfway-hero").unlocked, true);
  assert.equal(achievement(achievements, "orchard-champion").unlocked, true);
  assert.equal(achievement(achievements, "star-collector").unlocked, true);
  assert.equal(achievement(achievements, "perfect-thinker").unlocked, false);
  assert.equal(achievement(achievements, "apple-collector").unlocked, true);
  assert.equal(achievement(achievements, "apple-master").unlocked, true);
});

test("calculates star and perfect-thinker milestones from best saved results", () => {
  const achievements = getGuestAchievements(recordsForLevels(5, 3));
  assert.equal(achievement(achievements, "star-collector").progress, 10);
  assert.equal(achievement(achievements, "star-master").progress, 15);
  assert.equal(achievement(achievements, "perfect-thinker").progress, 5);
  assert.equal(achievement(achievements, "perfect-thinker").unlocked, true);
});

test("uses distinct completed records for progress and derives apples from level definitions", () => {
  const records = {
    1: { score: 100, moves: 8, stars: 3 },
    2: { score: 80, moves: 12, stars: 2 },
  };
  const achievements = getGuestAchievements(records);

  assert.equal(achievement(achievements, "first-apple").progress, 1);
  assert.equal(achievement(achievements, "getting-started").progress, 2);
  assert.equal(
    achievement(achievements, "apple-collector").progress,
    levels[0].board.apples.length + levels[1].board.apples.length,
  );
});

test("persists one-time achievement unlock dates and does not report duplicate unlocks", () => {
  const earnedAt = "2026-11-07T12:00:00.000Z";
  const first = persistGuestAchievementUnlocks(
    recordsForLevels(1, 3),
    {},
    {},
    earnedAt,
  );
  assert.deepEqual(first.newlyUnlocked, ["first-apple"]);
  assert.deepEqual(first.unlocks["first-apple"], { unlockedAt: earnedAt });

  const repeated = persistGuestAchievementUnlocks(
    recordsForLevels(1, 3),
    recordsForLevels(1, 3),
    first.unlocks,
    "2027-01-01T00:00:00.000Z",
  );
  assert.deepEqual(repeated.newlyUnlocked, []);
  assert.equal(repeated.unlocks, first.unlocks);
  assert.deepEqual(getGuestAchievements(recordsForLevels(1, 3), repeated.unlocks)
    .find(({ id }) => id === "first-apple").unlockedAt, earnedAt);
});

test("backfills existing earned achievements without inventing their unlock date", () => {
  const records = recordsForLevels(5, 3);
  const result = persistGuestAchievementUnlocks(records, records, {}, "2026-11-07T12:00:00.000Z");

  assert.deepEqual(result.newlyUnlocked, []);
  assert.deepEqual(result.unlocks["first-apple"], { unlockedAt: null });
  assert.deepEqual(result.unlocks["getting-started"], { unlockedAt: null });
  assert.deepEqual(result.unlocks["star-collector"], { unlockedAt: null });
});

test("validates persisted unlock identifiers and ISO dates", () => {
  assert.equal(isValidGuestAchievementUnlocks({
    "first-apple": { unlockedAt: "2026-11-07T12:00:00.000Z" },
  }), true);
  assert.equal(isValidGuestAchievementUnlocks({
    "unknown-achievement": { unlockedAt: null },
  }), false);
  assert.equal(isValidGuestAchievementUnlocks({
    "first-apple": { unlockedAt: "yesterday" },
  }), false);
});
