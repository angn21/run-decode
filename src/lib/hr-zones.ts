import type { ActivityRow } from "./db";
import { secondsToDuration } from "./format";
import type { StravaStreams } from "./strava";

export type HrZoneRange = { min: number; max: number };

export type HrZoneStat = {
  zone: number;
  label: string;
  seconds: number;
  percent: number;
  minBpm: number;
  maxBpm: number | null;
};

const ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;

/** Strava zone membership: hr >= min && (max === -1 || hr < max). */
export function zoneIndexForHr(hr: number, ranges: HrZoneRange[]): number {
  for (let i = 0; i < ranges.length; i++) {
    const { min, max } = ranges[i];
    if (hr >= min && (max === -1 || hr < max)) return i;
  }
  return ranges.length - 1;
}

function accumulateActivityZones(
  streams: StravaStreams,
  ranges: HrZoneRange[],
  buckets: number[],
): void {
  const hrs = streams.heartrate?.data as number[] | undefined;
  if (!hrs || hrs.length === 0) return;

  const times = streams.time?.data as number[] | undefined;

  for (let i = 0; i < hrs.length; i++) {
    const hr = hrs[i];
    if (!hr || hr <= 0) continue;

    let dt = 1;
    if (times && times.length === hrs.length) {
      if (i === 0) {
        dt = times.length > 1 ? Math.max(1, times[1] - times[0]) : 1;
      } else {
        dt = Math.max(1, times[i] - times[i - 1]);
      }
    }

    const idx = zoneIndexForHr(hr, ranges);
    if (idx >= 0 && idx < buckets.length) buckets[idx] += dt;
  }
}

/** Seconds spent in each HR zone for one activity's streams. */
export function zoneSecondsForStreams(
  streams: StravaStreams,
  ranges: HrZoneRange[],
): number[] | null {
  if (!ranges.length || !streams.heartrate?.data?.length) return null;
  const buckets = ranges.map(() => 0);
  accumulateActivityZones(streams, ranges, buckets);
  if (buckets.every((b) => b === 0)) return null;
  return buckets;
}

export function computeHrZones(
  activities: ActivityRow[],
  stravaZones: HrZoneRange[] | null,
): {
  zones: HrZoneStat[];
  summary: string;
  samplesWithHr: number;
  source: "strava" | "none";
} {
  if (!stravaZones || stravaZones.length === 0) {
    return { zones: [], summary: "—", samplesWithHr: 0, source: "none" };
  }

  const buckets = stravaZones.map(() => 0);
  let samplesWithHr = 0;

  for (const a of activities) {
    if (!a.streams_json) continue;
    try {
      const streams = JSON.parse(a.streams_json) as StravaStreams;
      if (!streams.heartrate?.data?.length) continue;
      samplesWithHr++;
      accumulateActivityZones(streams, stravaZones, buckets);
    } catch {
      /* ignore */
    }
  }

  const total = buckets.reduce((a, b) => a + b, 0);
  const zones: HrZoneStat[] =
    total > 0
      ? buckets.map((seconds, i) => {
          const rawMin = stravaZones[i].min;
          const rawMax = stravaZones[i].max;
          const prevMax = i > 0 ? stravaZones[i - 1].max : null;
          // Strava zones share boundaries (Z2.min === Z1.max); display without overlap
          const displayMin =
            prevMax != null && prevMax !== -1 && rawMin === prevMax
              ? rawMin + 1
              : rawMin;
          return {
            zone: i + 1,
            label: ZONE_LABELS[i] ?? `Z${i + 1}`,
            seconds,
            percent: Math.round((seconds / total) * 100),
            minBpm: displayMin,
            maxBpm: rawMax === -1 ? null : rawMax,
          };
        })
      : [];

  const summary =
    zones.length > 0
      ? [...zones]
          .sort((a, b) => b.seconds - a.seconds)
          .slice(0, 3)
          .map((z) => `${z.label} ${z.percent}%`)
          .join(" · ")
      : "—";

  return { zones, summary, samplesWithHr, source: "strava" };
}

export function formatZoneDuration(seconds: number): string {
  return secondsToDuration(Math.round(seconds));
}
