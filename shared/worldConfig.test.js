import assert from "node:assert/strict";
import test from "node:test";
import { levels, TOTAL_LEVELS } from "./levelData.js";
import {
  getWorldById,
  getWorldForLevel,
  getWorldProgress,
  hasWorldCompletion,
  isWorldUnlocked,
  WORLDS,
} from "./worldConfig.js";

test("defines four consecutive 25-level worlds with visual and progression metadata", () => {
  assert.deepEqual(
    WORLDS.map(({ id, levelStart, levelEnd }) => [id, levelStart, levelEnd]),
    [
      ["forest", 1, 25],
      ["desert", 26, 50],
      ["ice", 51, 75],
      ["lava", 76, 100],
    ],
  );
  assert.equal(WORLDS.length, 4);
  for (const world of WORLDS) {
    assert.ok(world.name);
    assert.ok(world.description);
    assert.ok(world.theme);
    assert.ok(world.visualTheme.icon);
    assert.ok(world.visualTheme.accent);
    assert.ok(world.visualTheme.surface);
    assert.ok(world.visualTheme.boardBackground);
    assert.ok(world.visualTheme.tileLight);
    assert.ok(world.visualTheme.tileDark);
    assert.ok(world.visualTheme.particle);
    assert.ok(world.visualTheme.decoration);
    assert.deepEqual(world.completionRequirement, {
      type: "complete-all-world-levels",
    });
  }
  assert.equal(TOTAL_LEVELS, 100);
});

test("maps every existing level to exactly one configured world", () => {
  assert.equal(levels.length, 100);
  for (const level of levels) {
    const world = getWorldForLevel(level.number);
    assert.ok(world, `Level ${level.number} should have a world`);
    assert.ok(level.number >= world.levelStart && level.number <= world.levelEnd);
  }
  assert.equal(getWorldForLevel(0), undefined);
  assert.equal(getWorldForLevel(101), undefined);
  assert.equal(getWorldForLevel(1.5), undefined);
});

test("unlocks each world only after all levels in its prerequisite world are completed", () => {
  const forest = getWorldById("forest");
  const desert = getWorldById("desert");
  const ice = getWorldById("ice");
  const lava = getWorldById("lava");
  const completed = new Set();

  assert.equal(isWorldUnlocked(forest, completed), true);
  assert.equal(isWorldUnlocked(desert, completed), false);
  completed.add(1);
  assert.equal(isWorldUnlocked(desert, completed), false);
  for (let level = 1; level <= 25; level += 1) completed.add(level);
  assert.equal(isWorldUnlocked(desert, completed), true);
  assert.equal(isWorldUnlocked(ice, completed), false);
  for (let level = 26; level <= 50; level += 1) completed.add(level);
  assert.equal(isWorldUnlocked(ice, completed), true);
  assert.equal(isWorldUnlocked(lava, completed), false);
  for (let level = 51; level <= 75; level += 1) completed.add(level);
  assert.equal(isWorldUnlocked(lava, completed), true);
  assert.equal(hasWorldCompletion(lava, completed), false);
});

test("reports per-world progress and availability without rewriting player progress", () => {
  const completed = new Set([1, 2, 26, 50]);
  assert.deepEqual(getWorldProgress(getWorldById("forest"), completed, 3), {
    completedCount: 2,
    totalLevels: 25,
    availableCount: 3,
    isComplete: false,
    isUnlocked: true,
  });
  assert.deepEqual(getWorldProgress(getWorldById("desert"), completed, 30), {
    completedCount: 2,
    totalLevels: 25,
    availableCount: 5,
    isComplete: false,
    isUnlocked: false,
  });
});
