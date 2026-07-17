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
import { resolveLabInterval, type LabPeriod } from "./lab";
import { getRunDecodeTimezone } from "./timezone";

export type LabTrendDay = {
  dayIndex: number;
  /** Current-period calendar label for the X-axis, e.g. "Jun 17". */
  label: string;
  /** Matching calendar day in the prior window, if any. */
  priorLabel: string | null;
  distanceKm: number;
  movingTimeSec: number;
  elevationM: number;
  distanceKmPrior: number | null;
  movingTimeSecPrior: number | null;
  elevationMPrior: number | null;
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

export type LabChartData = {
  days: LabTrendDay[];
  priorPeriodLabel: string | null;
  hasPrior: boolean;
  dayCount: number;
  hasRuns: boolean;
};

type DailyBucket = {
  dayIndex: number;
  label: string;
  dayKey: string;
  distanceKm: number;
  movingTimeSec: number;
  elevationM: number;
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
): DailyBucket[] {
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
    };
  }

  const currentBuckets = buildDailyBuckets(activities, start, dayCount, tz);
  const currentCum = toCumulative(currentBuckets);

  let priorCum: ReturnType<typeof toCumulative> | null = null;
  let priorBuckets: DailyBucket[] | null = null;
  if (hasPrior && priorStart) {
    priorBuckets = buildDailyBuckets(activities, priorStart, dayCount, tz);
    priorCum = toCumulative(priorBuckets);
  }

  const days: LabTrendDay[] = currentBuckets.map((b, i) => ({
    dayIndex: i,
    label: b.label,
    priorLabel: priorBuckets?.[i]?.label ?? null,
    distanceKm: currentCum.distanceKm[i],
    movingTimeSec: currentCum.movingTimeSec[i],
    elevationM: currentCum.elevationM[i],
    distanceKmPrior: priorCum ? priorCum.distanceKm[i] : null,
    movingTimeSecPrior: priorCum ? priorCum.movingTimeSec[i] : null,
    elevationMPrior: priorCum ? priorCum.elevationM[i] : null,
  }));

  return {
    days,
    priorPeriodLabel,
    hasPrior,
    dayCount,
    hasRuns: true,
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

export function getMetricValue(
  day: LabTrendDay,
  metricId: LabChartMetricId,
  prior = false,
): number | null {
  if (prior) {
    const v =
      metricId === "distanceKm"
        ? day.distanceKmPrior
        : metricId === "movingTimeSec"
          ? day.movingTimeSecPrior
          : day.elevationMPrior;
    return v == null || !Number.isFinite(v) ? null : v;
  }
  const v = day[metricId];
  return v == null || !Number.isFinite(v) ? null : v;
}
