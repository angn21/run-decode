import { parseISO, isWithinInterval, subDays } from "date-fns";
import type { ActivityRow } from "./db";
import {
  formatPercent,
  metersToKm,
  percentChange,
  speedToPace,
} from "./format";
import { classifyRun, rollingAvgSpeed } from "./run-classify";
import { weekIntervalUtc } from "./timezone";

export type CoachInsight = {
  type: "success" | "warning" | "info";
  title: string;
  body: string;
};

export type CoachStats = {
  thisWeekKm: number;
  lastWeekKm: number;
  mileageChange: number | null;
  tenPercentWarning: boolean;
  runCountThisWeek: number;
  easyCount: number;
  hardCount: number;
  easyHardRatio: string;
  weeklyStreak: number;
  avgPaceLast30: string;
  avgHrLast30: number | null;
  runsLast30: number;
  thisWeekElevM: number;
  lastWeekElevM: number;
  elevChange: number | null;
  thisWeekSuffer: number | null;
  lastWeekSuffer: number | null;
  sufferChange: number | null;
  milestones: string[];
  insights: CoachInsight[];
};

function runsInWeek(activities: ActivityRow[], weeksAgo: number) {
  const { start, end } = weekIntervalUtc(weeksAgo);
  return activities.filter((a) => {
    const d = parseISO(a.start_date);
    return isWithinInterval(d, { start, end });
  });
}

function weekKm(runs: ActivityRow[]) {
  return runs.reduce((sum, r) => sum + r.distance, 0) / 1000;
}

function weekElevM(runs: ActivityRow[]) {
  return Math.round(
    runs.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0),
  );
}

function weekSuffer(runs: ActivityRow[]): number | null {
  const vals = runs
    .map((r) => r.suffer_score)
    .filter((s): s is number => s != null && s > 0);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0));
}

function computeWeeklyStreak(activities: ActivityRow[]): number {
  let streak = 0;
  for (let w = 0; w < 52; w++) {
    const runs = runsInWeek(activities, w);
    if (runs.length >= 2) streak++;
    else break;
  }
  return streak;
}

function detectMilestones(activities: ActivityRow[]): string[] {
  const milestones: string[] = [];
  if (activities.length === 0) return milestones;

  const sorted = [...activities].sort(
    (a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime(),
  );

  const longest = sorted.reduce((max, a) => (a.distance > max.distance ? a : max));
  if (longest.distance >= 1000) {
    milestones.push(`Longest run: ${metersToKm(longest.distance)} km`);
  }

  const streak = computeWeeklyStreak(activities);
  if (streak >= 4) {
    milestones.push(`${streak}-week consistency streak`);
  }

  const sub30 = sorted.find(
    (a) => a.distance >= 4800 && a.moving_time > 0 && a.moving_time <= 30 * 60,
  );
  if (sub30) {
    milestones.push("Sub-30 5K unlocked");
  }

  return milestones.slice(0, 4);
}

function last30DayStats(activities: ActivityRow[]): {
  avgPaceLast30: string;
  avgHrLast30: number | null;
  runsLast30: number;
} {
  const cutoff = subDays(new Date(), 30);
  const recent = activities.filter(
    (a) => parseISO(a.start_date).getTime() >= cutoff.getTime(),
  );

  const speeds = recent
    .map((a) => a.average_speed)
    .filter((s): s is number => !!s && s > 0);
  const avgSpeed =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  const hrs = recent
    .map((a) => a.average_heartrate)
    .filter((h): h is number => !!h && h > 0);
  const avgHr =
    hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;

  return {
    avgPaceLast30: avgSpeed > 0 ? speedToPace(avgSpeed) : "—",
    avgHrLast30: avgHr,
    runsLast30: recent.length,
  };
}

export function computeCoachStats(activities: ActivityRow[]): CoachStats {
  const thisWeek = runsInWeek(activities, 0);
  const lastWeek = runsInWeek(activities, 1);

  const thisWeekKm = weekKm(thisWeek);
  const lastWeekKm = weekKm(lastWeek);
  const mileageChange = percentChange(thisWeekKm, lastWeekKm);
  const tenPercentWarning =
    lastWeekKm > 0 && thisWeekKm > lastWeekKm * 1.1;

  const thisWeekElevM = weekElevM(thisWeek);
  const lastWeekElevM = weekElevM(lastWeek);
  const elevChange = percentChange(thisWeekElevM, lastWeekElevM);
  const thisWeekSuffer = weekSuffer(thisWeek);
  const lastWeekSuffer = weekSuffer(lastWeek);
  const sufferChange =
    thisWeekSuffer != null && lastWeekSuffer != null
      ? percentChange(thisWeekSuffer, lastWeekSuffer)
      : null;

  const recent = activities.slice(0, 20);
  const rollingAvg = rollingAvgSpeed(recent);

  let easyCount = 0;
  let hardCount = 0;
  for (const run of thisWeek) {
    const cls = classifyRun(run, rollingAvg);
    if (cls === "easy") easyCount++;
    else hardCount++;
  }

  const weeklyStreak = computeWeeklyStreak(activities);
  const milestones = detectMilestones(activities);
  const { avgPaceLast30, avgHrLast30, runsLast30 } =
    last30DayStats(activities);
  const insights: CoachInsight[] = [];

  if (tenPercentWarning) {
    insights.push({
      type: "warning",
      title: "Mileage jumped fast",
      body: `You ran ${thisWeekKm.toFixed(1)} km this week — ${formatPercent(mileageChange)} vs last week. The 10% rule says keep weekly increases under 10% to stay injury-free.`,
    });
  } else if (thisWeekKm > 0 && mileageChange !== null && mileageChange > 0) {
    insights.push({
      type: "success",
      title: "Building steadily",
      body: `Up ${formatPercent(mileageChange)} from last week — a healthy bump. Keep most runs easy.`,
    });
  }

  if (hardCount >= 3 && thisWeek.length >= 3) {
    insights.push({
      type: "warning",
      title: "Lots of hard days",
      body: `${hardCount} hard runs this week. Consider an easy day or rest tomorrow — recovery is where fitness happens.`,
    });
  }

  if (
    elevChange != null &&
    elevChange > 20 &&
    mileageChange != null &&
    mileageChange > 0 &&
    thisWeekElevM > 100
  ) {
    insights.push({
      type: "warning",
      title: "Climbing load up",
      body: `Elevation is ${formatPercent(elevChange)} vs last week (${thisWeekElevM} m) while mileage also rose. Hills add stress — keep most runs easy.`,
    });
  } else if (
    sufferChange != null &&
    sufferChange > 25 &&
    thisWeekSuffer != null &&
    lastWeekSuffer != null &&
    lastWeekSuffer > 0
  ) {
    insights.push({
      type: "warning",
      title: "Relative effort spiked",
      body: `Suffer score sum is ${formatPercent(sufferChange)} vs last week (${thisWeekSuffer} vs ${lastWeekSuffer}). Watch recovery if hard days stack up.`,
    });
  }

  if (easyCount > 0 && hardCount === 0 && thisWeek.length >= 2) {
    insights.push({
      type: "success",
      title: "Easy miles banked",
      body: "All your runs this week look easy. That's exactly how habits stick.",
    });
  }

  if (weeklyStreak >= 2) {
    insights.push({
      type: "info",
      title: `${weeklyStreak}-week streak`,
      body: "You've hit 2+ runs per week consistently. That's real progress for a new runner.",
    });
  }

  if (insights.length === 0 && thisWeek.length === 0) {
    insights.push({
      type: "info",
      title: "Week just started",
      body: "No runs logged this week yet. Even a 20-minute easy jog counts.",
    });
  }

  const total = easyCount + hardCount;
  const easyHardRatio =
    total > 0 ? `${Math.round((easyCount / total) * 100)}% easy` : "—";

  return {
    thisWeekKm,
    lastWeekKm,
    mileageChange,
    tenPercentWarning,
    runCountThisWeek: thisWeek.length,
    easyCount,
    hardCount,
    easyHardRatio,
    weeklyStreak,
    avgPaceLast30,
    avgHrLast30,
    runsLast30,
    thisWeekElevM,
    lastWeekElevM,
    elevChange,
    thisWeekSuffer,
    lastWeekSuffer,
    sufferChange,
    milestones,
    insights,
  };
}
