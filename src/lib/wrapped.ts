import { parseISO, isWithinInterval, format } from "date-fns";
import type { ActivityRow } from "./db";
import { formatPercent, percentChange, speedToPace } from "./format";
import {
  formatInRunTimezone,
  monthIntervalUtc,
  monthLabelStart,
  weekIntervalUtc,
  weekLabelStart,
} from "./timezone";

export type WrappedPeriod = "week" | "month";

export type WrappedStats = {
  periodLabel: string;
  totalKm: number;
  totalTime: number;
  runCount: number;
  vsLastPeriod: number | null;
  fastestPace: string;
  fastestRunName: string;
  bestDay: string;
  easyPercent: number;
  polylines: string[];
  headline: string;
  coachNote: string;
};

function periodRuns(
  activities: ActivityRow[],
  period: WrappedPeriod,
  offset = 0,
) {
  const interval =
    period === "week" ? weekIntervalUtc(offset) : monthIntervalUtc(offset);
  const labelStart =
    period === "week" ? weekLabelStart(offset) : monthLabelStart(offset);

  return {
    runs: activities.filter((a) => {
      const d = parseISO(a.start_date);
      return isWithinInterval(d, { start: interval.start, end: interval.end });
    }),
    labelStart,
  };
}

export function computeWrapped(
  activities: ActivityRow[],
  period: WrappedPeriod = "week",
): WrappedStats {
  const { runs, labelStart } = periodRuns(activities, period, 0);
  const { runs: prevRuns } = periodRuns(activities, period, 1);

  const totalKm = runs.reduce((s, r) => s + r.distance, 0) / 1000;
  const prevKm = prevRuns.reduce((s, r) => s + r.distance, 0) / 1000;
  const totalTime = runs.reduce((s, r) => s + r.moving_time, 0);
  const vsLastPeriod = percentChange(totalKm, prevKm);

  let fastest = runs[0];
  for (const r of runs) {
    if (
      r.average_speed &&
      fastest?.average_speed &&
      r.average_speed > fastest.average_speed
    ) {
      fastest = r;
    }
  }

  const dayCounts: Record<string, number> = {};
  for (const r of runs) {
    const day = formatInRunTimezone(r.start_date, "EEEE");
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const bestDay =
    Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const speeds = activities.slice(0, 30).map((a) => a.average_speed).filter(Boolean) as number[];
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  let easy = 0;
  for (const r of runs) {
    if (!r.average_speed || r.average_speed <= avgSpeed * 1.05) easy++;
    else if (r.average_heartrate && r.average_heartrate < 155) easy++;
  }
  const easyPercent = runs.length ? Math.round((easy / runs.length) * 100) : 0;

  const polylines = runs
    .map((r) => r.summary_polyline)
    .filter((p): p is string => !!p);

  const periodLabel =
    period === "week"
      ? `Week of ${format(labelStart, "MMM d")}`
      : format(labelStart, "MMMM yyyy");

  let headline = "You showed up.";
  if (vsLastPeriod !== null && vsLastPeriod > 10) headline = "Big week.";
  else if (vsLastPeriod !== null && vsLastPeriod < -10) headline = "Recovery week.";
  else if (runs.length >= 4) headline = "Consistency king.";

  let coachNote = `${runs.length} runs · ${totalKm.toFixed(1)} km total`;
  if (vsLastPeriod !== null) {
    coachNote += ` · ${formatPercent(vsLastPeriod)} vs last ${period}`;
  }

  return {
    periodLabel,
    totalKm,
    totalTime,
    runCount: runs.length,
    vsLastPeriod,
    fastestPace: fastest ? speedToPace(fastest.average_speed) : "—",
    fastestRunName: fastest?.name ?? "—",
    bestDay,
    easyPercent,
    polylines,
    headline,
    coachNote,
  };
}
