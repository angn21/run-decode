import type { ActivityRow } from "./db";
import { percentChange } from "./format";

export type PaceComparison = "slower" | "faster" | "typical" | null;

const ROLLING_LIMIT = 30;
const MIN_PRIOR_RUNS = 3;

function validSpeeds(
  activities: ActivityRow[],
  excludeStravaId?: number,
): number[] {
  return activities
    .filter(
      (a) =>
        a.strava_id !== excludeStravaId &&
        a.average_speed != null &&
        a.average_speed > 0,
    )
    .slice(0, ROLLING_LIMIT)
    .map((a) => a.average_speed as number);
}

/** Average speed (m/s) from recent runs, excluding the current activity. */
export function getRollingAvgSpeed(
  activities: ActivityRow[],
  excludeStravaId?: number,
): number {
  const speeds = validSpeeds(activities, excludeStravaId);
  if (speeds.length < MIN_PRIOR_RUNS) return 0;
  return speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
}

export function getBaselineRunCount(
  activities: ActivityRow[],
  excludeStravaId?: number,
): number {
  return validSpeeds(activities, excludeStravaId).length;
}

/** % difference in pace vs baseline (positive = slower today). */
export function paceDeltaPercent(
  activity: ActivityRow,
  baseline: number,
): number | null {
  if (baseline <= 0 || !activity.average_speed || activity.average_speed <= 0) {
    return null;
  }

  const todayPaceSec = 1000 / activity.average_speed;
  const baselinePaceSec = 1000 / baseline;
  return percentChange(todayPaceSec, baselinePaceSec);
}

export function paceVsBaseline(
  activity: ActivityRow,
  baseline: number,
): PaceComparison {
  if (baseline <= 0 || !activity.average_speed || activity.average_speed <= 0) {
    return null;
  }

  const speed = activity.average_speed;
  if (speed < baseline * 0.95) return "slower";
  if (speed > baseline * 1.05) return "faster";
  return "typical";
}
