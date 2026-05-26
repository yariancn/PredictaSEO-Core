export function formatProjectedScoreRange(current, projected) {
  const gain = projected - current;
  if (gain < 5) return null;
  const low = Math.min(Math.round(current + gain * 0.65), 88);
  const high = Math.min(Math.round(current + gain * 0.9), 92);
  return {
    low: Math.max(low, current + 8),
    high: Math.max(high, low + 5),
  };
}
