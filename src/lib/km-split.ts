import type { ActivityRow } from "./db";
import { secondsToPace } from "./format";
import type { StravaStreams } from "./strava";

export type FastestKmSplit = {
  pace: string;
  seconds: number;
  runName: string | null;
  startDate: string | null;
  stravaId: number;
};

/** Fastest contiguous 1000m from distance + time streams. */
export function fastestKmFromStreams(
  streams: StravaStreams | null | undefined,
): number | null {
  if (!streams?.distance?.data || !streams?.time?.data) return null;

  const dist = streams.distance.data as number[];
  const time = streams.time.data as number[];
  if (dist.length < 2 || time.length < 2 || dist.length !== time.length) {
    return null;
  }

  const totalDist = dist[dist.length - 1];
  if (totalDist < 1000) return null;

  let bestSeconds: number | null = null;
  let j = 0;

  for (let i = 0; i < dist.length; i++) {
    while (j < dist.length && dist[j] - dist[i] < 1000) j++;
    if (j >= dist.length) break;
    const elapsed = time[j] - time[i];
    if (elapsed > 0 && (bestSeconds === null || elapsed < bestSeconds)) {
      bestSeconds = elapsed;
    }
  }

  return bestSeconds;
}

export function findFastestKmSplit(
  activities: ActivityRow[],
): FastestKmSplit | null {
  let best: FastestKmSplit | null = null;

  for (const activity of activities) {
    if (!activity.streams_json) continue;
    let streams: StravaStreams;
    try {
      streams = JSON.parse(activity.streams_json) as StravaStreams;
    } catch {
      continue;
    }

    const seconds = fastestKmFromStreams(streams);
    if (seconds == null) continue;

    if (!best || seconds < best.seconds) {
      best = {
        pace: secondsToPace(seconds),
        seconds,
        runName: activity.name,
        startDate: activity.start_date,
        stravaId: activity.strava_id,
      };
    }
  }

  return best;
}

export function countStreamsCoverage(
  activities: { streams_json: string | null }[],
): {
  withStreams: number;
  total: number;
} {
  const withStreams = activities.filter((a) => !!a.streams_json).length;
  return { withStreams, total: activities.length };
}
