import assert from "node:assert/strict";
import test from "node:test";
import { getVerifiedGameplayEffect } from "./rewardEffects.js";

test("accepts only a verified supported hint effect", () => {
  assert.deepEqual(getVerifiedGameplayEffect({
    rewardSession: { status: "granted" },
    gameplayEffect: { type: "hint", direction: "left" },
  }), { type: "hint", direction: "left" });
  assert.equal(getVerifiedGameplayEffect({
    rewardSession: { status: "pending" },
    gameplayEffect: { type: "hint", direction: "left" },
  }), null);
  assert.equal(getVerifiedGameplayEffect({
    rewardSession: { status: "granted" },
    gameplayEffect: { type: "booster", direction: "left" },
  }), null);
});
