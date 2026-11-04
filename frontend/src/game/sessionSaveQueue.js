export function createSessionSaveQueue({ save, onSaved, onError }) {
  let pending = null;
  let current = null;
  let drainPromise = null;
  let blocked = false;
  const savedSnapshots = new Map();

  async function drain() {
    if (blocked) return;
    if (drainPromise) return drainPromise;
    drainPromise = (async () => {
      while (pending) {
        const job = pending;
        pending = null;
        const snapshot = JSON.stringify(job.actions);
        if (savedSnapshots.get(job.sessionId) === snapshot) continue;

        current = job;
        try {
          const result = await save(job.sessionId, job.actions);
          savedSnapshots.set(job.sessionId, snapshot);
          onSaved(result, job);
        } catch (error) {
          if (!pending) pending = job;
          blocked = true;
          onError(error, job);
          break;
        } finally {
          current = null;
        }
      }
    })().finally(() => {
      drainPromise = null;
      if (pending && !blocked) void drain();
    });
    return drainPromise;
  }

  function enqueue(sessionId, actions, generation) {
    const snapshot = JSON.stringify(actions);
    if (savedSnapshots.get(sessionId) === snapshot) return;
    if (pending?.sessionId === sessionId && JSON.stringify(pending.actions) === snapshot) return;
    if (current?.sessionId === sessionId && JSON.stringify(current.actions) === snapshot) return;
    pending = { sessionId, actions: [...actions], generation };
    blocked = false;
    void drain();
  }

  return {
    enqueue,
    flush: async () => {
      if (drainPromise) await drainPromise;
      while (pending && !blocked) await drain();
      return pending === null && !blocked;
    },
    retry() {
      if (pending) {
        blocked = false;
        void drain();
      }
    },
    flushForPageHide(sessionId, actions, generation) {
      const snapshot = JSON.stringify(actions);
      if (savedSnapshots.get(sessionId) === snapshot) return;
      void save(sessionId, [...actions], { keepalive: true })
        .then((result) => {
          savedSnapshots.set(sessionId, snapshot);
          onSaved(result, { sessionId, actions: [...actions], generation });
        })
        .catch((error) => onError(error, { sessionId, actions: [...actions], generation }));
    },
  };
}
