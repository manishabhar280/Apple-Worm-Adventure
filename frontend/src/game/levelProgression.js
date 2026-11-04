export function calculateStars(moves, parMoves) {
  if (moves <= parMoves) {
    return 3;
  }
  if (moves <= Math.ceil(parMoves * 1.5)) {
    return 2;
  }
  return 1;
}

export function recordLevelCompletion(records, level, game) {
  const result = {
    score: game.score,
    moves: game.moves,
    stars: calculateStars(game.moves, level.parMoves),
  };
  const previous = records[level.number];

  if (
    previous &&
    (previous.stars > result.stars ||
      (previous.stars === result.stars &&
        (previous.score > result.score ||
          (previous.score === result.score && previous.moves <= result.moves))))
  ) {
    return records;
  }

  return { ...records, [level.number]: result };
}
