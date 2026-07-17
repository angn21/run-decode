import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  isWithinInterval,
  parseISO,
  startOfDay,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import type { ActivityRow } from "./db";
import { secondsToDuration } from "./format";
import { zoneSecondsForStreams, type HrZoneRange } from "./hr-zones";
import { resolveLabInterval, type LabPeriod } from "./lab";
import type { StravaStreams } from "./strava";
import { getRunDecodeTimezone } from "./timezone";

export type LabChartMode =
  | "cumulative"
  | "daily_volume"
  | "avg_hr"
  | "zone_time";

export const LAB_CHART_MODES: { id: LabChartMode; label: string }[] = [
  { id: "cumulative", label: "Cumulative" },
  { id: "daily_volume", label: "Daily volume" },
  { id: "avg_hr", label: "Avg HR" },
  { id: "zone_time", label: "Zone time" },
];

export type LabTrendDay = {
  dayIndex: number;
  label: string;
  priorLabel: string | null;
  /** Cumulative distance (km) */
  distanceKm: number;
  movingTimeSec: number;
  elevationM: number;
  distanceKmPrior: number | null;
  movingTimeSecPrior: number | null;
  elevationMPrior: number | null;
  /** Daily (non-cumulative) km */
  dailyKm: number;
  dailyKmPrior: number | null;
  /** Mean of run avg HR that day; null if no HR */
  avgHr: number | null;
  avgHrPrior: number | null;
  /** % of HR-stream time in each zone that day (0–100) */
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  z1Prior: number | null;
  z2Prior: number | null;
  z3Prior: number | null;
  z4Prior: number | null;
  z5Prior: number | null;
  hasZoneData: boolean;
  hasZoneDataPrior: boolean;
};

export type LabChartMetricId = "distanceKm" | "movingTimeSec" | "elevationM";

export type LabChartUnit = "km" | "sec" | "m";

export type LabChartMetricDef = {
  id: LabChartMetricId;
  label: string;
  unit: LabChartUnit;
  color: string;
};

export const LAB_CHART_METRICS: LabChartMetricDef[] = [
  { id: "distanceKm", label: "Distance", unit: "km", color: "#fc4c02" },
  { id: "movingTimeSec", label: "Moving time", unit: "sec", color: "#38bdf8" },
  { id: "elevationM", label: "Elevation", unit: "m", color: "#a3e635" },
];

export const DEFAULT_LAB_CHART_METRICS: LabChartMetricId[] = ["distanceKm"];

export const ZONE_COLORS = [
  "#94a3b8",
  "#38bdf8",
  "#a3e635",
  "#fbbf24",
  "#f43f5e",
] as const;

export type LabChartData = {
  days: LabTrendDay[];
  priorPeriodLabel: string | null;
  hasPrior: boolean;
  dayCount: number;
  hasRuns: boolean;
  hasZoneStreams: boolean;
};

type DailyBucket = {
  dayIndex: number;
  label: string;
  dayKey: string;
  distanceKm: number;
  movingTimeSec: number;
  elevationM: number;
  hrSum: number;
  hrCount: number;
  zoneSeconds: number[];
};

function priorInterval(start: Date, end: Date): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - durationMs);
  return { start: priorStart, end: priorEnd };
}

function filterInInterval(
  activities: ActivityRow[],
  start: Date,
  end: Date,
): ActivityRow[] {
  return activities.filter((a) => {
    const d = parseISO(a.start_date);
    return isWithinInterval(d, { start, end });
  });
}

function formatPeriodRangeLabel(start: Date, end: Date): string {
  const tz = getRunDecodeTimezone();
  const startLabel = formatInTimeZone(start, tz, "MMM d");
  const endLabel = formatInTimeZone(end, tz, "MMM d, yyyy");
  const startYear = formatInTimeZone(start, tz, "yyyy");
  const endYear = formatInTimeZone(end, tz, "yyyy");
  if (startYear !== endYear) {
    return `${formatInTimeZone(start, tz, "MMM d, yyyy")} – ${endLabel}`;
  }
  return `${startLabel} – ${endLabel}`;
}

function calendarDayCount(start: Date, end: Date, tz: string): number {
  const startDay = startOfDay(toZonedTime(start, tz));
  const endDay = startOfDay(toZonedTime(end, tz));
  return Math.max(1, differenceInCalendarDays(endDay, startDay) + 1);
}

function buildDailyBuckets(
  activities: ActivityRow[],
  windowStart: Date,
  dayCount: number,
  tz: string,
  stravaZones: HrZoneRange[] | null,
): DailyBucket[] {
  const zoneN = stravaZones?.length ?? 5;
  const buckets: DailyBucket[] = [];
  const startLocal = startOfDay(toZonedTime(windowStart, tz));

  for (let i = 0; i < dayCount; i++) {
    const localDay = addDays(startLocal, i);
    const utcDayStart = fromZonedTime(localDay, tz);
    buckets.push({
      dayIndex: i,
      label: formatInTimeZone(utcDayStart, tz, "MMM d"),
      dayKey: formatInTimeZone(utcDayStart, tz, "yyyy-MM-dd"),
      distanceKm: 0,
      movingTimeSec: 0,
      elevationM: 0,
      hrSum: 0,
      hrCount: 0,
      zoneSeconds: Array.from({ length: zoneN }, () => 0),
    });
  }

  const byKey = new Map(buckets.map((b) => [b.dayKey, b]));
  for (const a of activities) {
    const key = formatInTimeZone(parseISO(a.start_date), tz, "yyyy-MM-dd");
    const bucket = byKey.get(key);
    if (!bucket) continue;
    bucket.distanceKm += a.distance / 1000;
    bucket.movingTimeSec += a.moving_time || 0;
    bucket.elevationM += a.total_elevation_gain || 0;
    if (a.average_heartrate != null && a.average_heartrate > 0) {
      bucket.hrSum += a.average_heartrate;
      bucket.hrCount++;
    }
    if (stravaZones && a.streams_json) {
      try {
        const streams = JSON.parse(a.streams_json) as StravaStreams;
        const zs = zoneSecondsForStreams(streams, stravaZones);
        if (zs) {
          for (let i = 0; i < zs.length && i < bucket.zoneSeconds.length; i++) {
            bucket.zoneSeconds[i] += zs[i];
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return buckets;
}

function toCumulative(buckets: DailyBucket[]): {
  distanceKm: number[];
  movingTimeSec: number[];
  elevationM: number[];
} {
  const distanceKm: number[] = [];
  const movingTimeSec: number[] = [];
  const elevationM: number[] = [];
  let d = 0;
  let t = 0;
  let e = 0;
  for (const b of buckets) {
    d += b.distanceKm;
    t += b.movingTimeSec;
    e += b.elevationM;
    distanceKm.push(Math.round(d * 100) / 100);
    movingTimeSec.push(t);
    elevationM.push(Math.round(e));
  }
  return { distanceKm, movingTimeSec, elevationM };
}

function zonePercents(seconds: number[]): {
  percents: number[];
  hasData: boolean;
} {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return {
      percents: seconds.map(() => 0),
      hasData: false,
    };
  }
  return {
    percents: seconds.map((s) => Math.round((s / total) * 1000) / 10),
    hasData: true,
  };
}

function resolveAllTimeWindow(activities: ActivityRow[]): {
  start: Date;
  end: Date;
} | null {
  if (activities.length === 0) return null;
  const tz = getRunDecodeTimezone();
  let earliest = activities[0].start_date;
  for (const a of activities) {
    if (a.start_date < earliest) earliest = a.start_date;
  }
  const start = fromZonedTime(
    startOfDay(toZonedTime(parseISO(earliest), tz)),
    tz,
  );
  const end = fromZonedTime(endOfDay(toZonedTime(new Date(), tz)), tz);
  return { start, end };
}

export function buildLabChartData(
  activities: ActivityRow[],
  period: LabPeriod,
  stravaZones: HrZoneRange[] | null = null,
): LabChartData {
  const tz = getRunDecodeTimezone();
  let { start, end } = resolveLabInterval(period);
  let hasPrior = false;
  let priorPeriodLabel: string | null = null;
  let priorStart: Date | null = null;

  if (!start || !end) {
    const allTime = resolveAllTimeWindow(activities);
    if (!allTime) {
      return {
        days: [],
        priorPeriodLabel: null,
        hasPrior: false,
        dayCount: 0,
        hasRuns: false,
        hasZoneStreams: false,
      };
    }
    start = allTime.start;
    end = allTime.end;
  } else {
    hasPrior = true;
    const priorWin = priorInterval(start, end);
    priorStart = priorWin.start;
    priorPeriodLabel = formatPeriodRangeLabel(priorWin.start, priorWin.end);
  }

  const dayCount = calendarDayCount(start, end, tz);
  const currentRuns = filterInInterval(activities, start, end);
  const hasRuns = currentRuns.length > 0;

  if (!hasRuns) {
    return {
      days: [],
      priorPeriodLabel,
      hasPrior,
      dayCount,
      hasRuns: false,
      hasZoneStreams: false,
    };
  }

  const currentBuckets = buildDailyBuckets(
    activities,
    start,
    dayCount,
    tz,
    stravaZones,
  );
  const currentCum = toCumulative(currentBuckets);

  let priorBuckets: DailyBucket[] | null = null;
  let priorCum: ReturnType<typeof toCumulative> | null = null;
  if (hasPrior && priorStart) {
    priorBuckets = buildDailyBuckets(
      activities,
      priorStart,
      dayCount,
      tz,
      stravaZones,
    );
    priorCum = toCumulative(priorBuckets);
  }

  let hasZoneStreams = false;
  const days: LabTrendDay[] = currentBuckets.map((b, i) => {
    const z = zonePercents(b.zoneSeconds);
    if (z.hasData) hasZoneStreams = true;
    const pz = priorBuckets
      ? zonePercents(priorBuckets[i].zoneSeconds)
      : null;
    if (pz?.hasData) hasZoneStreams = true;

    return {
      dayIndex: i,
      label: b.label,
      priorLabel: priorBuckets?.[i]?.label ?? null,
      distanceKm: currentCum.distanceKm[i],
      movingTimeSec: currentCum.movingTimeSec[i],
      elevationM: currentCum.elevationM[i],
      distanceKmPrior: priorCum ? priorCum.distanceKm[i] : null,
      movingTimeSecPrior: priorCum ? priorCum.movingTimeSec[i] : null,
      elevationMPrior: priorCum ? priorCum.elevationM[i] : null,
      dailyKm: Math.round(b.distanceKm * 100) / 100,
      dailyKmPrior: priorBuckets
        ? Math.round(priorBuckets[i].distanceKm * 100) / 100
        : null,
      avgHr:
        b.hrCount > 0 ? Math.round(b.hrSum / b.hrCount) : null,
      avgHrPrior:
        priorBuckets && priorBuckets[i].hrCount > 0
          ? Math.round(priorBuckets[i].hrSum / priorBuckets[i].hrCount)
          : null,
      z1: z.percents[0] ?? 0,
      z2: z.percents[1] ?? 0,
      z3: z.percents[2] ?? 0,
      z4: z.percents[3] ?? 0,
      z5: z.percents[4] ?? 0,
      z1Prior: pz?.hasData ? (pz.percents[0] ?? 0) : null,
      z2Prior: pz?.hasData ? (pz.percents[1] ?? 0) : null,
      z3Prior: pz?.hasData ? (pz.percents[2] ?? 0) : null,
      z4Prior: pz?.hasData ? (pz.percents[3] ?? 0) : null,
      z5Prior: pz?.hasData ? (pz.percents[4] ?? 0) : null,
      hasZoneData: z.hasData,
      hasZoneDataPrior: pz?.hasData ?? false,
    };
  });

  return {
    days,
    priorPeriodLabel,
    hasPrior,
    dayCount,
    hasRuns: true,
    hasZoneStreams,
  };
}

export function formatMetricValue(
  metricId: LabChartMetricId,
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (metricId) {
    case "distanceKm":
      return `${value.toFixed(1)} km`;
    case "movingTimeSec":
      return secondsToDuration(value);
    case "elevationM":
      return `${Math.round(value)} m`;
  }
}

export function formatAxisTick(unit: LabChartUnit, value: number): string {
  switch (unit) {
    case "km":
      return value.toFixed(value >= 10 ? 0 : 1);
    case "sec":
      return secondsToDuration(value);
    case "m":
      return `${Math.round(value)}`;
  }
}
