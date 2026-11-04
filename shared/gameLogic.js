export const DIRECTIONS = {
  up: { row: -1, column: 0 },
  down: { row: 1, column: 0 },
  left: { row: 0, column: -1 },
  right: { row: 0, column: 1 },
};

const samePosition = (first, second) =>
  first.row === second.row && first.column === second.column;

export function createInitialGameState(board) {
  return {
    status: "ready",
    worm: board.worm.map((segment) => ({ ...segment })),
    apples: board.apples.map((apple) => ({ ...apple })),
    moves: 0,
    score: 0,
  };
}

export function moveGame(state, direction, board) {
  const delta = DIRECTIONS[direction];
  if (!delta || !["ready", "playing"].includes(state.status)) {
    return state;
  }

  const head = state.worm[state.worm.length - 1];
  const nextHead = {
    row: head.row + delta.row,
    column: head.column + delta.column,
  };
  const { rows, columns } = board;

  if (
    nextHead.row < 0 ||
    nextHead.row >= rows ||
    nextHead.column < 0 ||
    nextHead.column >= columns
  ) {
    return state;
  }

  const collectedApple = state.apples.some((apple) =>
    samePosition(apple, nextHead),
  );
  const hitsObstacle = board.obstacles.some((obstacle) =>
    samePosition(obstacle, nextHead),
  );
  const bodyToCheck = collectedApple
    ? state.worm
    : state.worm.slice(1);
  const hitsWorm = bodyToCheck.some((segment) =>
    samePosition(segment, nextHead),
  );

  if (hitsObstacle || hitsWorm) {
    return {
      ...state,
      status: "lost",
      moves: state.moves + 1,
    };
  }

  const apples = collectedApple
    ? state.apples.filter((apple) => !samePosition(apple, nextHead))
    : state.apples;
  const worm = collectedApple
    ? [...state.worm, nextHead]
    : [...state.worm.slice(1), nextHead];
  const reachedPortal = samePosition(board.portal, nextHead);

  return {
    ...state,
    status: reachedPortal && apples.length === 0 ? "won" : "playing",
    worm,
    apples,
    moves: state.moves + 1,
    score: state.score + (collectedApple ? 100 : 0),
  };
}

export function togglePause(state) {
  if (state.status === "ready" || state.status === "playing") {
    return { ...state, status: "paused" };
  }
  if (state.status === "paused") {
    return { ...state, status: "playing" };
  }
  return state;
}

export function replayGameActions(board, actions) {
  return actions.reduce(
    (state, direction) => moveGame(state, direction, board),
    createInitialGameState(board),
  );
}

function findPath(start, goal, board, worm) {
  const obstacleKeys = new Set(
    board.obstacles.map(({ row, column }) => `${row}:${column}`),
  );
  const bodyKeys = new Set(
    worm.slice(0, -1).map(({ row, column }) => `${row}:${column}`),
  );
  const queue = [{ ...start, firstDirection: null }];
  const visited = new Set([`${start.row}:${start.column}`]);
  const directions = Object.entries(DIRECTIONS);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (samePosition(current, goal)) return current.firstDirection;
    for (const [direction, delta] of directions) {
      const next = {
        row: current.row + delta.row,
        column: current.column + delta.column,
      };
      const key = `${next.row}:${next.column}`;
      if (
        next.row < 0 ||
        next.row >= board.rows ||
        next.column < 0 ||
        next.column >= board.columns ||
        obstacleKeys.has(key) ||
        bodyKeys.has(key) ||
        visited.has(key)
      ) continue;
      visited.add(key);
      queue.push({
        ...next,
        firstDirection: current.firstDirection ?? direction,
      });
    }
  }
  return null;
}

export function findHint(state, board) {
  if (!["ready", "playing"].includes(state.status)) return null;
  const head = state.worm[state.worm.length - 1];
  const targets = state.apples.length > 0 ? state.apples : [board.portal];
  return targets
    .map((target) => findPath(head, target, board, state.worm))
    .find(Boolean) || null;
}
