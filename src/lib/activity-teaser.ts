import type { CachedDecodeResult } from "./decoder";
import { isCachedDecodeValid } from "./decoder";
import type { ActivityRow } from "./db";
import {
  getBaselineRunCount,
  getRollingAvgSpeed,
  paceDeltaPercent,
  paceVsBaseline,
} from "./run-baseline";

export function buildActivityTeaser(
  activity: ActivityRow,
  allActivities: ActivityRow[],
): string {
  const cached = activity.insights_json
    ? (JSON.parse(activity.insights_json) as CachedDecodeResult)
    : null;

  if (isCachedDecodeValid(cached)) {
    return teaserFromCached(cached);
  }

  return buildSyncTeaser(activity, allActivities);
}

function teaserFromCached(cached: CachedDecodeResult): string {
  const parts: string[] = [];
  for (const stat of cached.verdictStats ?? []) {
    if (parts.length >= 2) break;
    parts.push(shortenStat(stat));
  }

  if (parts.length === 0) {
    const v = cached.verdict;
    return v.length > 72 ? `${v.slice(0, 69)}…` : v;
  }

  return parts.join(" · ");
}

function shortenStat(stat: string): string {
  const slowerMatch = stat.match(/^(\d+)% slower than your recent average/);
  if (slowerMatch) return `${slowerMatch[1]}% slower than average`;

  const fasterMatch = stat.match(/^(\d+)% faster than your recent average/);
  if (fasterMatch) return `${fasterMatch[1]}% faster than average`;

  if (stat.startsWith("Within")) return stat.split("(")[0].trim();
  if (stat.startsWith("HR drifted")) {
    return stat.replace(" in the second half", "");
  }
  if (stat.startsWith("Heat/humidity")) {
    const m = stat.match(/~(\d+)%/);
    return m ? `~${m[1]}% heat adj` : "warm conditions";
  }
  if (stat.includes("climbed")) return stat.split("(")[0].trim();
  if (stat.includes("other hot runs") || stat.includes("other hilly runs")) {
    return stat.split("(")[0].trim();
  }
  if (stat.startsWith("Avg HR")) return stat;

  return stat.length > 40 ? `${stat.slice(0, 37)}…` : stat;
}

function buildSyncTeaser(
  activity: ActivityRow,
  allActivities: ActivityRow[],
): string {
  const parts: string[] = [];
  const baseline = getRollingAvgSpeed(allActivities, activity.strava_id);
  const count = getBaselineRunCount(allActivities, activity.strava_id);

  if (count >= 3 && baseline > 0) {
    const comparison = paceVsBaseline(activity, baseline);
    const delta = paceDeltaPercent(activity, baseline);
    if (comparison === "slower" && delta != null) {
      parts.push(`${Math.abs(delta).toFixed(0)}% slower than average`);
    } else if (comparison === "faster" && delta != null) {
      parts.push(`${Math.abs(delta).toFixed(0)}% faster than average`);
    } else if (comparison === "typical") {
      parts.push("On your usual pace");
    }
  }

  const perKm =
    activity.distance > 0
      ? activity.total_elevation_gain / (activity.distance / 1000)
      : 0;
  if (activity.total_elevation_gain > 50 || perKm >= 15) {
    parts.push("hilly");
  }

  if (activity.average_heartrate) {
    if (activity.average_heartrate < 145) parts.push("easy HR");
    else if (activity.average_heartrate > 160) parts.push("hard effort");
  }

  return parts.length > 0 ? parts.join(" · ") : "Tap to decode";
}
