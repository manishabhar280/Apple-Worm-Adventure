const directions = new Set(["up", "down", "left", "right"]);

export function getVerifiedGameplayEffect(result) {
  if (result?.rewardSession?.status !== "granted") return null;
  const effect = result.gameplayEffect;
  if (effect?.type !== "hint" || !directions.has(effect.direction)) return null;
  return effect;
}
