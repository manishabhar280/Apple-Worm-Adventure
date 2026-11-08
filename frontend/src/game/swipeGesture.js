export const MIN_SWIPE_DISTANCE = 14;
const AXIS_DOMINANCE_RATIO = 1.15;

export function getSwipeDirection(
  start,
  end,
  minDistance = MIN_SWIPE_DISTANCE,
) {
  if (!start || !end) return null;

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (Math.max(absX, absY) < minDistance) return null;
  if (absX >= absY * AXIS_DOMINANCE_RATIO) {
    return deltaX > 0 ? "right" : "left";
  }
  if (absY >= absX * AXIS_DOMINANCE_RATIO) {
    return deltaY > 0 ? "down" : "up";
  }
  return null;
}
