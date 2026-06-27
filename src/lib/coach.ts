import {
  endOfWeek,
  startOfWeek,
  subWeeks,
  parseISO,
  isWithinInterval,
} from "date-fns";
import type { ActivityRow } from "./db";
import { formatPercent, metersToKm, percentChange } from "./format";

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
  milestones: string[];
  insights: CoachInsight[];
};

function weekInterval(weeksAgo: number) {
  const ref = subWeeks(new Date(), weeksAgo);
  return {
    start: startOfWeek(ref, { weekStartsOn: 1 }),
    end: endOfWeek(ref, { weekStartsOn: 1 }),
  };
}

function runsInWeek(activities: ActivityRow[], weeksAgo: number) {
  const { start, end } = weekInterval(weeksAgo);
  return activities.filter((a) => {
    const d = parseISO(a.start_date);
    return isWithinInterval(d, { start, end });
  });
}

function weekKm(runs: ActivityRow[]) {
  return runs.reduce((sum, r) => sum + r.distance, 0) / 1000;
}

function classifyRun(
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

  const first5k = sorted.find((a) => a.distance >= 4800);
  if (first5k) {
    milestones.push(
      `First 5K — ${parseISO(first5k.start_date).toLocaleDateString()}`,
    );
  }

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

export function computeCoachStats(activities: ActivityRow[]): CoachStats {
  const thisWeek = runsInWeek(activities, 0);
  const lastWeek = runsInWeek(activities, 1);

  const thisWeekKm = weekKm(thisWeek);
  const lastWeekKm = weekKm(lastWeek);
  const mileageChange = percentChange(thisWeekKm, lastWeekKm);
  const tenPercentWarning =
    lastWeekKm > 0 && thisWeekKm > lastWeekKm * 1.1;

  const recent = activities.slice(0, 20);
  const speeds = recent
    .map((a) => a.average_speed)
    .filter((s): s is number => !!s && s > 0);
  const rollingAvgSpeed =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  let easyCount = 0;
  let hardCount = 0;
  for (const run of thisWeek) {
    const cls = classifyRun(run, rollingAvgSpeed);
    if (cls === "easy") easyCount++;
    else hardCount++;
  }

  const weeklyStreak = computeWeeklyStreak(activities);
  const milestones = detectMilestones(activities);
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
    milestones,
    insights,
  };
}
