import type { ActivityRow } from "./db";
import { percentChange } from "./format";
import type { WeatherData } from "./weather";
import { weatherPaceAdjustment } from "./weather";

const HOT_TEMP_C = 25;
const HILLY_PER_KM = 15;
const HILLY_GAIN_M = 50;
const MIN_PEERS = 2;

export type ConditionComparison = {
  label: "hot runs" | "hilly runs";
  deltaPct: number;
  peerCount: number;
};

function isHilly(activity: ActivityRow): boolean {
  const perKm =
    activity.distance > 0
      ? activity.total_elevation_gain / (activity.distance / 1000)
      : 0;
  return (
    activity.total_elevation_gain >= HILLY_GAIN_M || perKm >= HILLY_PER_KM
  );
}

function cachedWeather(activity: ActivityRow): WeatherData | null {
  if (!activity.insights_json) return null;
  try {
    const cached = JSON.parse(activity.insights_json) as {
      weather?: WeatherData | null;
    };
    return cached.weather ?? null;
  } catch {
    return null;
  }
}

function isHotWeather(weather: WeatherData): boolean {
  return (
    weather.temperature >= HOT_TEMP_C ||
    weatherPaceAdjustment(weather.temperature, weather.humidity) > 3
  );
}

function compareToPeers(
  activity: ActivityRow,
  peers: ActivityRow[],
): { deltaPct: number; peerCount: number } | null {
  const speeds = peers
    .filter((p) => p.average_speed != null && p.average_speed > 0)
    .map((p) => p.average_speed as number);

  if (speeds.length < MIN_PEERS || !activity.average_speed) return null;

  const avgSpeed = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
  const todayPaceSec = 1000 / activity.average_speed;
  const peerPaceSec = 1000 / avgSpeed;
  const deltaPct = percentChange(todayPaceSec, peerPaceSec);
  if (deltaPct == null) return null;

  return { deltaPct, peerCount: speeds.length };
}

export function compareSimilarConditions(
  activity: ActivityRow,
  recentActivities: ActivityRow[],
  weather: WeatherData | null,
): ConditionComparison | null {
  const others = recentActivities.filter(
    (a) => a.strava_id !== activity.strava_id,
  );

  const todayHot = weather != null && isHotWeather(weather);
  const todayHilly = isHilly(activity);

  if (todayHot) {
    const hotPeers = others.filter((a) => {
      const w = cachedWeather(a);
      return w != null && isHotWeather(w);
    });
    const result = compareToPeers(activity, hotPeers);
    if (result) {
      return { label: "hot runs", ...result };
    }
  }

  if (todayHilly) {
    const hillyPeers = others.filter(isHilly);
    const result = compareToPeers(activity, hillyPeers);
    if (result) {
      return { label: "hilly runs", ...result };
    }
  }

  return null;
}

export function formatConditionComparison(
  comparison: ConditionComparison,
): string {
  const absPct = Math.abs(comparison.deltaPct).toFixed(0);
  const n = comparison.peerCount;

  if (Math.abs(comparison.deltaPct) < 1) {
    return `In line with your other ${comparison.label} (${n} compared)`;
  }
  if (comparison.deltaPct > 0) {
    return `${absPct}% slower than your other ${comparison.label} (${n} compared)`;
  }
  return `${absPct}% faster than your other ${comparison.label} (${n} compared)`;
}
