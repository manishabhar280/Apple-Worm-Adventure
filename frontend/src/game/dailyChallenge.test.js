import assert from "node:assert/strict";
import test from "node:test";
import {
  getDailyChallenge,
  getPreviousUtcDate,
  isUtcDateKey,
  recordDailyChallengeCompletion,
  toUtcDateKey,
} from "./dailyChallenge.js";

test("daily challenge is deterministic for the UTC date and chooses an existing level", () => {
  assert.deepEqual(getDailyChallenge("2026-11-08"), getDailyChallenge("2026-11-08"));
  assert.notEqual(
    getDailyChallenge("2026-11-08").levelNumber,
    getDailyChallenge("2026-11-09").levelNumber,
  );
  assert.ok(getDailyChallenge("2026-11-08").levelNumber >= 1);
  assert.ok(getDailyChallenge("2026-11-08").levelNumber <= 100);
});

test("date helpers use UTC and reject malformed calendar dates", () => {
  assert.equal(toUtcDateKey(new Date("2026-11-08T23:59:00-05:00")), "2026-11-09");
  assert.equal(getPreviousUtcDate("2026-01-01"), "2025-12-31");
  assert.equal(isUtcDateKey("2024-02-29"), true);
  assert.equal(isUtcDateKey("2025-02-29"), false);
  assert.equal(isUtcDateKey("yesterday"), false);
  assert.throws(() => getDailyChallenge("2026-02-30"), /valid UTC/);
});

test("daily rewards are idempotent and streaks handle consecutive and missed days", () => {
  const first = recordDailyChallengeCompletion({}, "2026-11-06");
  assert.equal(first.reward, 20);
  assert.equal(first.daily.currentStreak, 1);
  const repeated = recordDailyChallengeCompletion(first.daily, "2026-11-06");
  assert.equal(repeated.completedNew, false);
  assert.equal(repeated.reward, 0);

  const consecutive = recordDailyChallengeCompletion(first.daily, "2026-11-07");
  assert.equal(consecutive.daily.currentStreak, 2);
  const missed = recordDailyChallengeCompletion(consecutive.daily, "2026-11-09");
  assert.equal(missed.daily.currentStreak, 1);
  assert.equal(missed.daily.longestStreak, 2);
});

test("backfilled dates do not roll back the latest streak state", () => {
  const current = recordDailyChallengeCompletion(
    { completions: {}, lastCompletedDate: "2026-11-08", currentStreak: 3, longestStreak: 3 },
    "2026-11-06",
  );
  assert.equal(current.daily.lastCompletedDate, "2026-11-08");
  assert.equal(current.daily.currentStreak, 3);
  assert.equal(current.daily.longestStreak, 3);
});
