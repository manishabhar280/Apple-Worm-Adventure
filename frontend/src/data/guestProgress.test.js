import assert from "node:assert/strict";
import test from "node:test";
import {
  completeGuestLevel,
  completeGuestLevelWithFeatures,
  createDefaultGuestProgress,
  GUEST_PROGRESS_STORAGE_KEY,
  isValidGuestProgress,
  readGuestProgress,
  saveGuestProgress,
} from "./guestProgress.js";
import { levels, TOTAL_LEVELS } from "./levelData.js";
import { getDailyChallenge } from "../game/dailyChallenge.js";
import { FEATURE_REWARDS } from "../../../shared/levelFeatures.js";

function createMemoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem(key) {
      assert.equal(key, GUEST_PROGRESS_STORAGE_KEY);
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, GUEST_PROGRESS_STORAGE_KEY);
      value = nextValue;
    },
  };
}

test("starts a guest with only Level 1 unlocked and default settings", () => {
  const result = readGuestProgress(createMemoryStorage());

  assert.deepEqual(result, {
    progress: createDefaultGuestProgress(),
    canSave: true,
    error: "",
  });
});

test("saves and restores versioned guest progress and settings", () => {
  const storage = createMemoryStorage();
  const progress = {
    ...createDefaultGuestProgress(),
    records: { 1: { score: 100, moves: 8, stars: 3 } },
    unlockedLevel: 2,
    activeGame: { levelNumber: 2, actions: ["right"] },
    settings: { reducedMotion: true },
  };

  saveGuestProgress(progress, storage);
  assert.deepEqual(readGuestProgress(storage), {
    progress,
    canSave: true,
    error: "",
  });
});

test("accepts legacy guest saves without achievement metadata and preserves their progress", () => {
  const legacyProgress = {
    version: 1,
    unlockedLevel: 2,
    records: { 1: { score: 100, moves: 8, stars: 3 } },
    activeGame: null,
    settings: { reducedMotion: true },
  };
  const storage = createMemoryStorage(JSON.stringify(legacyProgress));
  const loaded = readGuestProgress(storage);

  assert.equal(loaded.canSave, true);
  assert.deepEqual(loaded.progress, legacyProgress);
  assert.equal(isValidGuestProgress(loaded.progress), true);

  const completed = completeGuestLevel(loaded.progress, levels[1], {
    status: "won",
    score: 200,
    moves: levels[1].parMoves,
  }, "2026-11-07T12:00:00.000Z");
  assert.deepEqual(completed.records[1], legacyProgress.records[1]);
  assert.equal(completed.settings.reducedMotion, true);
  assert.deepEqual(completed.achievements["first-apple"], {
    unlockedAt: null,
  });
  assert.equal(isValidGuestProgress(completed), true);
});

test("does not overwrite malformed or unsupported saved progress", () => {
  const storage = createMemoryStorage('{"version":99}');
  const result = readGuestProgress(storage);

  assert.equal(result.canSave, false);
  assert.match(result.error, /unsupported version/);
  assert.equal(storage.getItem(GUEST_PROGRESS_STORAGE_KEY), '{"version":99}');
});

test("reports browser storage failures without preventing guest play", () => {
  const storage = {
    getItem() {
      throw new Error("Storage unavailable");
    },
  };
  const result = readGuestProgress(storage);

  assert.equal(result.canSave, false);
  assert.match(result.error, /could not be read/);
  assert.deepEqual(result.progress, createDefaultGuestProgress());
});

test("reports local save failures instead of silently claiming progress was saved", () => {
  const storage = {
    setItem() {
      throw new Error("Quota exceeded");
    },
  };
  assert.throws(
    () => saveGuestProgress(createDefaultGuestProgress(), storage),
    /Quota exceeded/,
  );
});

test("rejects invalid level access and unlocks each next level only on a win", () => {
  let progress = createDefaultGuestProgress();
  const invalidAttempt = completeGuestLevel(progress, levels[1], {
    status: "won",
    score: 100,
    moves: 10,
  });
  assert.equal(invalidAttempt, progress);

  for (const level of levels) {
    progress = completeGuestLevel(progress, level, {
      status: "won",
      score: level.number * 10,
      moves: level.parMoves,
    });
    assert.equal(
      progress.unlockedLevel,
      Math.min(TOTAL_LEVELS, level.number + 1),
    );
  }

  assert.equal(progress.unlockedLevel, TOTAL_LEVELS);
  assert.equal(Object.keys(progress.records).length, TOTAL_LEVELS);
  assert.equal(isValidGuestProgress(progress), true);
});

test("validates active actions, completion records, and progression bounds", () => {
  const progress = createDefaultGuestProgress();
  assert.equal(isValidGuestProgress({
    ...progress,
    activeGame: { levelNumber: 1, actions: ["not-a-direction"] },
  }), false);
  assert.equal(isValidGuestProgress({
    ...progress,
    records: { 1: { score: -1, moves: 1, stars: 3 } },
    unlockedLevel: 2,
  }), false);
  assert.equal(isValidGuestProgress({
    ...progress,
    unlockedLevel: 100,
  }), false);
  assert.equal(isValidGuestProgress({
    ...progress,
    token: "must-not-be-persisted",
  }), false);
  assert.equal(isValidGuestProgress({
    ...progress,
    achievements: { "unknown-achievement": { unlockedAt: null } },
  }), false);
});

test("accepts a locked daily challenge level only for its matching UTC date", () => {
  const challenge = getDailyChallenge("2026-03-01");
  const progress = createDefaultGuestProgress();
  const activeChallenge = {
    levelNumber: challenge.levelNumber,
    actions: [],
    challengeDate: challenge.date,
  };

  assert.equal(isValidGuestProgress({ ...progress, activeGame: activeChallenge }), true);
  assert.equal(isValidGuestProgress({
    ...progress,
    activeGame: { ...activeChallenge, challengeDate: "2026-03-02" },
  }), false);
  assert.equal(isValidGuestProgress({
    ...progress,
    activeGame: { levelNumber: challenge.levelNumber, actions: [] },
  }), false);
});

test("persists achievement unlocks once when a new level completion crosses a milestone", () => {
  let progress = createDefaultGuestProgress();
  progress = completeGuestLevel(progress, levels[0], {
    status: "won",
    score: 100,
    moves: levels[0].parMoves,
  }, "2026-11-07T12:00:00.000Z");

  assert.deepEqual(progress.achievements["first-apple"], {
    unlockedAt: "2026-11-07T12:00:00.000Z",
  });
  const alreadyCompleted = completeGuestLevel(progress, levels[0], {
    status: "won",
    score: 100,
    moves: levels[0].parMoves,
  }, "2027-01-01T00:00:00.000Z");
  assert.equal(alreadyCompleted, progress);
});

test("awards configured collectible and efficient-level rewards once", () => {
  const level = levels[4];
  const progress = {
    ...createDefaultGuestProgress(),
    unlockedLevel: level.number,
    records: Object.fromEntries(levels.slice(0, 4).map((completedLevel) => [
      completedLevel.number,
      { score: 100, moves: completedLevel.parMoves, stars: 2 },
    ])),
  };
  const game = {
    status: "won",
    score: 100,
    moves: level.parMoves,
    collectedGoldenAppleIds: ["golden-5"],
  };

  const rewarded = completeGuestLevelWithFeatures(progress, level, game);
  assert.equal(
    rewarded.engagement.coins,
    FEATURE_REWARDS.goldenApple + FEATURE_REWARDS.efficientCompletion,
  );
  assert.deepEqual(rewarded.engagement.rewardedCollectibles, ["5:golden:golden-5"]);
  assert.deepEqual(rewarded.engagement.rewardedEfficientLevels, [5]);
  assert.equal(completeGuestLevelWithFeatures(rewarded, level, game), rewarded);
  assert.equal(isValidGuestProgress(rewarded), true);
});

test("records daily rewards and consecutive streaks without unlocking regular levels", () => {
  const firstDate = "2026-03-01";
  const secondDate = "2026-03-02";
  const firstChallenge = getDailyChallenge(firstDate);
  const secondChallenge = getDailyChallenge(secondDate);
  let progress = createDefaultGuestProgress();

  progress = completeGuestLevelWithFeatures(progress, levels[firstChallenge.levelNumber - 1], {
    status: "won",
    score: 100,
    moves: 10,
  }, { challengeDate: firstDate, today: firstDate });
  progress = completeGuestLevelWithFeatures(progress, levels[secondChallenge.levelNumber - 1], {
    status: "won",
    score: 100,
    moves: 10,
  }, { challengeDate: secondDate, today: secondDate });

  assert.equal(progress.unlockedLevel, 1);
  assert.equal(progress.engagement.coins, 2 * FEATURE_REWARDS.dailyChallenge);
  assert.equal(Object.keys(progress.engagement.daily.completions).length, 2);
  assert.equal(progress.engagement.daily.currentStreak, 2);
  assert.equal(progress.engagement.daily.longestStreak, 2);
  assert.equal(isValidGuestProgress(progress), true);
});
