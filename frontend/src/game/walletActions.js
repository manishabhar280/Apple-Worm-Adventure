import { findHint } from "./gameLogic.js";

export async function requestGameHint({
  game,
  board,
  moveLimit,
  requestId,
  onPurchaseHint,
  onUseBooster,
}) {
  const direction = findHint(game, board, moveLimit);
  if (!direction) return { direction: null, purchase: null };
  const purchase = onUseBooster
    ? await onUseBooster()
    : onPurchaseHint
      ? await onPurchaseHint(requestId)
      : null;
  return { direction, purchase };
}
