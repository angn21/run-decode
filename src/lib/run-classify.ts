import type { ActivityRow } from "./db";

export function classifyRun(
  activity: ActivityRow,
  rollingAvgSpeed: number,
): "easy" | "hard" {
  if (activity.average_heartrate && activity.average_heartrate > 155) {
    return "hard";
  }
  if (rollingAvgSpeed > 0 && activity.average_speed) {
    return activity.average_speed > rollingAvgSpeed * 1.05 ? "hard" : "easy";
  }
  return "easy";
}

/** Rolling average speed (m/s) from the most recent N activities with valid speed. */
export function rollingAvgSpeed(
  activities: ActivityRow[],
  limit = 20,
): number {
  const speeds = activities
    .slice(0, limit)
    .map((a) => a.average_speed)
    .filter((s): s is number => !!s && s > 0);
  if (speeds.length === 0) return 0;
  return speeds.reduce((a, b) => a + b, 0) / speeds.length;
}
