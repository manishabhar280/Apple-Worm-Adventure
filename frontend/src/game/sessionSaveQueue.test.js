import assert from "node:assert/strict";
import test from "node:test";
import { createSessionSaveQueue } from "./sessionSaveQueue.js";

const waitFor = async (condition) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("Timed out waiting for queued session saves.");
};

test("serializes saves, coalesces pending moves, and skips duplicate snapshots", async () => {
  const saves = [];
  const results = [];
  let releaseFirst;
  const queue = createSessionSaveQueue({
    save: async (sessionId, actions) => {
      saves.push({ sessionId, actions });
      if (saves.length === 1) await new Promise((resolve) => { releaseFirst = resolve; });
      return { session: { status: "in_progress" }, progress: { levels: [] } };
    },
    onSaved: (_result, job) => results.push(job.actions),
    onError: assert.fail,
  });

  queue.enqueue("session-1", ["right"], 1);
  await waitFor(() => Boolean(releaseFirst));
  queue.enqueue("session-1", ["right", "down"], 1);
  queue.enqueue("session-1", ["right", "down"], 1);
  releaseFirst();
  assert.equal(await queue.flush(), true);
  queue.enqueue("session-1", ["right", "down"], 1);
  await queue.flush();

  assert.deepEqual(saves.map(({ actions }) => actions), [
    ["right"],
    ["right", "down"],
  ]);
  assert.deepEqual(results, [["right"], ["right", "down"]]);
});

test("retains a failed save for an explicit retry", async () => {
  let attempts = 0;
  const failures = [];
  const queue = createSessionSaveQueue({
    save: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return { session: { status: "in_progress" }, progress: { levels: [] } };
    },
    onSaved: () => {},
    onError: (error) => failures.push(error.message),
  });

  queue.enqueue("session-1", ["left"], 1);
  await waitFor(() => failures.length === 1);
  assert.equal(await queue.flush(), false);
  queue.retry();
  assert.equal(await queue.flush(), true);
  assert.equal(attempts, 2);
});

test("page-exit flushes the latest moves with fetch keepalive", async () => {
  let pageExitRequest;
  const queue = createSessionSaveQueue({
    save: async (sessionId, actions, options) => {
      pageExitRequest = { sessionId, actions, options };
      return { session: { status: "in_progress" }, progress: { levels: [] } };
    },
    onSaved: () => {},
    onError: assert.fail,
  });

  queue.flushForPageHide("session-2", ["left", "up"], 3);
  await waitFor(() => Boolean(pageExitRequest));
  assert.deepEqual(pageExitRequest, {
    sessionId: "session-2",
    actions: ["left", "up"],
    options: { keepalive: true },
  });
});
