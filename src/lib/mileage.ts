export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * True when this week's km is more than 10% above the median of prior weeks.
 * Median (not last week) avoids a recovery week looking like a spike.
 */
export function isTenPercentMileageJump(
  thisWeekKm: number,
  priorWeekKms: number[],
): boolean {
  const baseline = median(priorWeekKms);
  if (baseline == null || baseline <= 0 || thisWeekKm <= 0) return false;
  return thisWeekKm > baseline * 1.1;
}
