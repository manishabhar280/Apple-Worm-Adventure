import { findHint } from "./gameLogic.js";

export async function requestGameHint({ game, board, requestId, onPurchaseHint }) {
  const direction = findHint(game, board);
  if (!direction) return { direction: null, purchase: null };
  const purchase = onPurchaseHint
    ? await onPurchaseHint(requestId)
    : null;
  return { direction, purchase };
}
