import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStars,
  recordLevelCompletion,
} from "./levelProgression.js";

test("awards stars based on the level's par move count", () => {
  assert.equal(calculateStars(10, 10), 3);
  assert.equal(calculateStars(15, 10), 2);
  assert.equal(calculateStars(16, 10), 1);
});

test("records a level result and keeps a better previous result", () => {
  const level = { number: 1, parMoves: 10 };
  const first = recordLevelCompletion({}, level, {
    score: 100,
    moves: 15,
  });
  const better = recordLevelCompletion(first, level, {
    score: 200,
    moves: 10,
  });
  const worse = recordLevelCompletion(better, level, {
    score: 100,
    moves: 16,
  });

  assert.deepEqual(first[1], { score: 100, moves: 15, stars: 2 });
  assert.deepEqual(better[1], { score: 200, moves: 10, stars: 3 });
  assert.equal(worse, better);
});
