export function metersToKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

export function metersToMiles(meters: number): string {
  return (meters / 1609.344).toFixed(1);
}

export function secondsToPace(secondsPerKm: number): string {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) return "—";
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

export function secondsToDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function speedToPace(mps: number | null | undefined): string {
  if (!mps || mps <= 0) return "—";
  return secondsToPace(1000 / mps);
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}
