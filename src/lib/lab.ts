import {
  endOfDay,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  isWithinInterval,
} from "date-fns";
import { fromZonedTime, formatInTimeZone, toZonedTime } from "date-fns-tz";
import type { ActivityRow } from "./db";
import {
  formatPercent,
  percentChange,
  secondsToDuration,
  speedToPace,
} from "./format";
import { findFastestKmSplit, type FastestKmSplit } from "./km-split";
import { computeHrZones, type HrZoneRange, type HrZoneStat } from "./hr-zones";
import { classifyRun, rollingAvgSpeed } from "./run-classify";
import {
  formatInRunTimezone,
  getRunDecodeTimezone,
  monthIntervalUtc,
  weekIntervalUtc,
} from "./timezone";

export type LabPreset =
  | "this_week"
  | "last_week"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all_time";

export const LAB_PRESETS: { id: LabPreset; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "last_90_days", label: "Last 90 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_year", label: "This year" },
  { id: "all_time", label: "All time" },
];

export type LabPeriod =
  | { kind: "preset"; preset: LabPreset }
  | { kind: "custom"; from: string; to: string };

export type LabStats = {
  periodLabel: string;
  /** Concrete dates for the selected window, e.g. "Jun 17 – Jul 16, 2026". */
  periodRangeLabel: string | null;
  runCount: number;
  totalKm: number;
  totalTime: number;
  totalTimeLabel: string;
  elapsedTime: number;
  elapsedTimeLabel: string;
  totalCalories: number | null;
  totalElevationM: number;
  totalSuffer: number | null;
  longestRunKm: number | null;
  longestRunName: string | null;
  longestRunDate: string | null;
  avgPace: string;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  easyCount: number;
  hardCount: number;
  easyPercent: number | null;
  hardPercent: number | null;
  easyHardLabel: string;
  easyHardDetail: string;
  vsPrior: number | null;
  vsPriorLabel: string;
  /** Human-readable prior window, e.g. "Jun 1 – Jun 30, 2026". */
  priorPeriodLabel: string | null;
  priorKm: number | null;
  fastestKm: FastestKmSplit | null;
  hrZones: HrZoneStat[];
  hrZonesSummary: string;
  hrZonesSource: "strava" | "none";
  streamsWithData: number;
  streamsTotal: number;
};

function nowInTimezone(): Date {
  return toZonedTime(new Date(), getRunDecodeTimezone());
}

function dayBoundsUtc(localDay: Date): { start: Date; end: Date } {
  const tz = getRunDecodeTimezone();
  return {
    start: fromZonedTime(startOfDay(localDay), tz),
    end: fromZonedTime(endOfDay(localDay), tz),
  };
}

export function resolveLabInterval(
  period: LabPeriod,
): { start: Date | null; end: Date | null; label: string } {
  const tz = getRunDecodeTimezone();
  const nowLocal = nowInTimezone();

  if (period.kind === "custom") {
    const fromLocal = parseISO(`${period.from}T12:00:00`);
    const toLocal = parseISO(`${period.to}T12:00:00`);
    const start = fromZonedTime(startOfDay(fromLocal), tz);
    const end = fromZonedTime(endOfDay(toLocal), tz);
    const label =
      period.from === period.to
        ? format(fromLocal, "MMM d, yyyy")
        : `${format(fromLocal, "MMM d")} – ${format(toLocal, "MMM d, yyyy")}`;
    return { start, end, label };
  }

  switch (period.preset) {
    case "this_week": {
      const { start, end } = weekIntervalUtc(0);
      return { start, end, label: "This week" };
    }
    case "last_week": {
      const { start, end } = weekIntervalUtc(1);
      return { start, end, label: "Last week" };
    }
    case "last_7_days": {
      const end = dayBoundsUtc(nowLocal).end;
      const start = dayBoundsUtc(subDays(nowLocal, 6)).start;
      return { start, end, label: "Last 7 days" };
    }
    case "last_30_days": {
      const end = dayBoundsUtc(nowLocal).end;
      const start = dayBoundsUtc(subDays(nowLocal, 29)).start;
      return { start, end, label: "Last 30 days" };
    }
    case "last_90_days": {
      const end = dayBoundsUtc(nowLocal).end;
      const start = dayBoundsUtc(subDays(nowLocal, 89)).start;
      return { start, end, label: "Last 90 days" };
    }
    case "this_month": {
      const { start, end } = monthIntervalUtc(0);
      return { start, end, label: format(startOfMonth(nowLocal), "MMMM yyyy") };
    }
    case "last_month": {
      const { start, end } = monthIntervalUtc(1);
      const ref = subMonths(nowLocal, 1);
      return { start, end, label: format(startOfMonth(ref), "MMMM yyyy") };
    }
    case "this_year": {
      const start = fromZonedTime(startOfYear(nowLocal), tz);
      const end = fromZonedTime(endOfYear(nowLocal), tz);
      return { start, end, label: format(nowLocal, "yyyy") };
    }
    case "all_time":
      return { start: null, end: null, label: "All time" };
  }
}

function filterInInterval(
  activities: ActivityRow[],
  start: Date | null,
  end: Date | null,
): ActivityRow[] {
  if (!start || !end) return activities;
  return activities.filter((a) => {
    const d = parseISO(a.start_date);
    return isWithinInterval(d, { start, end });
  });
}

/** Prior window of equal length immediately before [start, end]. */
function priorInterval(
  start: Date,
  end: Date,
): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - durationMs);
  return { start: priorStart, end: priorEnd };
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

export function parseLabPeriod(searchParams: {
  preset?: string;
  from?: string;
  to?: string;
}): LabPeriod {
  const from = searchParams.from?.trim();
  const to = searchParams.to?.trim();
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { kind: "custom", from, to: from <= to ? to : from };
  }

  const preset = searchParams.preset as LabPreset | undefined;
  if (preset && LAB_PRESETS.some((p) => p.id === preset)) {
    return { kind: "preset", preset };
  }

  return { kind: "preset", preset: "this_week" };
}

export function computeLabStats(
  activities: ActivityRow[],
  period: LabPeriod,
  stravaHrZones: HrZoneRange[] | null = null,
): LabStats {
  const { start, end, label } = resolveLabInterval(period);
  const periodRangeLabel =
    start && end ? formatPeriodRangeLabel(start, end) : null;
  const runs = filterInInterval(activities, start, end);

  const totalKm = runs.reduce((s, r) => s + r.distance, 0) / 1000;
  const totalTime = runs.reduce((s, r) => s + r.moving_time, 0);
  const elapsedTime = runs.reduce((s, r) => s + (r.elapsed_time || 0), 0);

  let caloriesSum = 0;
  let caloriesFound = 0;
  for (const r of runs) {
    if (!r.raw_json) continue;
    try {
      const raw = JSON.parse(r.raw_json) as {
        calories?: number;
        kilojoules?: number;
      };
      // Strava list payloads often omit `calories` but include `kilojoules`
      // (watch energy estimate — treat as kcal when calories is absent).
      if (typeof raw.calories === "number" && raw.calories > 0) {
        caloriesSum += raw.calories;
        caloriesFound++;
      } else if (typeof raw.kilojoules === "number" && raw.kilojoules > 0) {
        caloriesSum += raw.kilojoules;
        caloriesFound++;
      }
    } catch {
      /* ignore bad json */
    }
  }
  const totalCalories = caloriesFound > 0 ? Math.round(caloriesSum) : null;

  const totalElevationM = Math.round(
    runs.reduce((s, r) => s + (r.total_elevation_gain || 0), 0),
  );

  const sufferValues = runs
    .map((r) => r.suffer_score)
    .filter((s): s is number => s != null && s > 0);
  const totalSuffer =
    sufferValues.length > 0
      ? Math.round(sufferValues.reduce((a, b) => a + b, 0))
      : null;

  let longest: ActivityRow | null = null;
  for (const r of runs) {
    if (!longest || r.distance > longest.distance) longest = r;
  }
  const longestRunKm =
    longest && longest.distance >= 1000
      ? Math.round((longest.distance / 1000) * 10) / 10
      : null;
  const longestRunName = longestRunKm != null ? longest?.name ?? null : null;
  const longestRunDate =
    longestRunKm != null && longest?.start_date
      ? formatInRunTimezone(longest.start_date, "MMM d, yyyy")
      : null;

  const speeds = runs
    .map((r) => r.average_speed)
    .filter((s): s is number => !!s && s > 0);
  const avgSpeed =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  const hrs = runs
    .map((r) => r.average_heartrate)
    .filter((h): h is number => !!h && h > 0);
  const avgHr =
    hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;

  const maxHrs = runs
    .map((r) => r.max_heartrate)
    .filter((h): h is number => !!h && h > 0);
  const maxHr = maxHrs.length > 0 ? Math.round(Math.max(...maxHrs)) : null;

  const cadences = runs
    .map((r) => r.average_cadence)
    .filter((c): c is number => !!c && c > 0);
  // Strava cadence is often steps/min per foot; display as spm (×2) when values look like single-foot
  const avgCadenceRaw =
    cadences.length > 0
      ? cadences.reduce((a, b) => a + b, 0) / cadences.length
      : null;
  const avgCadence =
    avgCadenceRaw != null
      ? Math.round(avgCadenceRaw < 120 ? avgCadenceRaw * 2 : avgCadenceRaw)
      : null;

  const baseline = rollingAvgSpeed(activities);
  let easyCount = 0;
  let hardCount = 0;
  for (const run of runs) {
    if (classifyRun(run, baseline) === "easy") easyCount++;
    else hardCount++;
  }
  const totalEH = easyCount + hardCount;
  const easyPercent =
    totalEH > 0 ? Math.round((easyCount / totalEH) * 100) : null;
  const hardPercent =
    totalEH > 0 ? Math.round((hardCount / totalEH) * 100) : null;
  const easyHardLabel =
    easyPercent != null && hardPercent != null
      ? `${easyPercent}% easy · ${hardPercent}% hard`
      : "—";
  const easyHardDetail =
    totalEH > 0 ? `${easyCount} easy · ${hardCount} hard` : "—";

  let vsPrior: number | null = null;
  let priorPeriodLabel: string | null = null;
  let priorKm: number | null = null;
  if (start && end) {
    const prior = priorInterval(start, end);
    const priorRuns = filterInInterval(activities, prior.start, prior.end);
    priorKm = priorRuns.reduce((s, r) => s + r.distance, 0) / 1000;
    vsPrior = percentChange(totalKm, priorKm);
    priorPeriodLabel = formatPeriodRangeLabel(prior.start, prior.end);
  }

  const fastestKm = findFastestKmSplit(runs);
  const streamsWithData = runs.filter((a) => !!a.streams_json).length;
  const {
    zones: hrZones,
    summary: hrZonesSummary,
    source: hrZonesSource,
  } = computeHrZones(runs, stravaHrZones);

  return {
    periodLabel: label,
    periodRangeLabel,
    runCount: runs.length,
    totalKm,
    totalTime,
    totalTimeLabel: secondsToDuration(totalTime),
    elapsedTime,
    elapsedTimeLabel: secondsToDuration(elapsedTime),
    totalCalories,
    totalElevationM,
    totalSuffer,
    longestRunKm,
    longestRunName,
    longestRunDate,
    avgPace: avgSpeed > 0 ? speedToPace(avgSpeed) : "—",
    avgHr,
    maxHr,
    avgCadence,
    easyCount,
    hardCount,
    easyPercent,
    hardPercent,
    easyHardLabel,
    easyHardDetail,
    vsPrior,
    vsPriorLabel: formatPercent(vsPrior),
    priorPeriodLabel,
    priorKm,
    fastestKm,
    hrZones,
    hrZonesSummary,
    hrZonesSource,
    streamsWithData,
    streamsTotal: runs.length,
  };
}
