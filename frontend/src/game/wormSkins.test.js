import assert from "node:assert/strict";
import test from "node:test";
import {
  getCompletedLevelCount,
  getEquippedWormSkin,
  getUnlockedWormSkins,
  isWormSkinUnlocked,
  WORM_SKINS,
} from "./wormSkins.js";

function records(count) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [index + 1, { score: 1 }]),
  );
}

test("cosmetic skins unlock only at their configured progression milestones", () => {
  assert.deepEqual(getUnlockedWormSkins({}).map(({ id }) => id), ["classic"]);
  assert.equal(isWormSkinUnlocked("fire", records(4)), false);
  assert.equal(isWormSkinUnlocked("fire", records(5)), true);
  assert.equal(isWormSkinUnlocked("ice", records(25)), true);
  assert.equal(isWormSkinUnlocked("rainbow", records(50)), true);
  assert.equal(isWormSkinUnlocked("galaxy", records(100)), true);
  assert.equal(WORM_SKINS.length, 5);
});

test("selected skins can be previewed safely without granting locked cosmetics", () => {
  assert.equal(getEquippedWormSkin("galaxy", records(1)), "classic");
  assert.equal(getEquippedWormSkin("fire", records(5)), "fire");
  assert.equal(getCompletedLevelCount({ 1: {}, invalid: {}, 101: {} }), 1);
});
