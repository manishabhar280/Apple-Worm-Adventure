import assert from "node:assert/strict";
import test from "node:test";
import { getSwipeDirection, MIN_SWIPE_DISTANCE } from "./swipeGesture.js";

test("recognizes each cardinal swipe direction", () => {
  assert.equal(
    getSwipeDirection({ x: 24, y: 210 }, { x: 54, y: 210 }),
    "right",
  );
  assert.equal(
    getSwipeDirection({ x: 310, y: 180 }, { x: 280, y: 180 }),
    "left",
  );
  assert.equal(
    getSwipeDirection({ x: 140, y: 315 }, { x: 140, y: 285 }),
    "up",
  );
  assert.equal(
    getSwipeDirection({ x: 88, y: 18 }, { x: 88, y: 48 }),
    "down",
  );
});

test("recognizes short swipes from arbitrary board locations", () => {
  assert.equal(
    getSwipeDirection({ x: 15, y: 24 }, { x: 31, y: 25 }),
    "right",
  );
  assert.equal(
    getSwipeDirection({ x: 280, y: 310 }, { x: 279, y: 294 }),
    "up",
  );
});

test("filters taps, tiny movements, and ambiguous diagonals", () => {
  const start = { x: 100, y: 100 };
  assert.equal(getSwipeDirection(start, start), null);
  assert.equal(
    getSwipeDirection(start, { x: 100 + MIN_SWIPE_DISTANCE - 1, y: 100 }),
    null,
  );
  assert.equal(getSwipeDirection(start, { x: 125, y: 124 }), null);
});

test("selects the clearly dominant axis for diagonal movement", () => {
  assert.equal(
    getSwipeDirection({ x: 0, y: 0 }, { x: 35, y: 10 }),
    "right",
  );
  assert.equal(
    getSwipeDirection({ x: 0, y: 0 }, { x: 10, y: -35 }),
    "up",
  );
});
