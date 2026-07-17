import {
  compareSimilarConditions,
  formatConditionComparison,
  type ConditionComparison,
} from "./conditions-compare";
import type { ActivityRow } from "./db";
import { speedToPace, secondsToDuration } from "./format";
import {
  getBaselineRunCount,
  getRollingAvgSpeed,
  paceDeltaPercent,
  paceVsBaseline,
  type PaceComparison,
} from "./run-baseline";
import type { StravaStreams } from "./strava";
import {
  fetchWeatherAt,
  weatherPaceAdjustment,
  type WeatherData,
} from "./weather";

export const DECODER_VERSION = 5;

export type PaceInsight = {
  icon: string;
  title: string;
  body: string;
  tone: "neutral" | "positive" | "caution";
};

export type DecodeResult = {
  version: number;
  verdict: string;
  verdictStats: string[];
  insights: PaceInsight[];
  weather: WeatherData | null;
};

export type CachedDecodeResult = DecodeResult & {
  version?: number;
  verdictStats?: string[];
};

export function isCachedDecodeValid(
  cached: CachedDecodeResult | null,
): cached is CachedDecodeResult {
  return !!cached && (cached.version ?? 0) >= DECODER_VERSION;
}

type DecodeContext = {
  paceComparison: PaceComparison;
  paceDeltaPct: number | null;
  todayPace: string;
  baselinePace: string | null;
  baselineRunCount: number;
  heatAdjPct: number | null;
  hrDriftBpm: number | null;
  elevationGain: number | null;
  elevationPerKm: number | null;
  conditionComparison: ConditionComparison | null;
};

function pickVariant(variants: string[], seed: number): string {
  return variants[((seed % variants.length) + variants.length) % variants.length];
}

function avgHrInRange(
  heartrate: number[],
  startIdx: number,
  endIdx: number,
): number | null {
  const slice = heartrate.slice(startIdx, endIdx).filter((h) => h > 0);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeHrDrift(
  streams: StravaStreams | null | undefined,
): number | null {
  if (!streams?.heartrate?.data || !streams?.distance?.data) return null;

  const hr = streams.heartrate.data as number[];
  const dist = streams.distance.data as number[];
  const midDist = dist[dist.length - 1] / 2;
  const midIdx = dist.findIndex((d) => d >= midDist);

  if (midIdx <= 0) return null;

  const hrFirst = avgHrInRange(hr, 0, midIdx);
  const hrSecond = avgHrInRange(hr, midIdx, hr.length);
  if (!hrFirst || !hrSecond) return null;

  return hrSecond - hrFirst;
}

/** Mean cadence (spm) first 2/3 vs last 1/3; positive = fade (drop). */
export function computeCadenceFade(
  streams: StravaStreams | null | undefined,
): number | null {
  const raw = streams?.cadence?.data as number[] | undefined;
  if (!raw || raw.length < 30) return null;

  const toSpm = (c: number) => (c > 0 && c < 120 ? c * 2 : c);
  const vals = raw.map(toSpm).filter((c) => c >= 120 && c <= 220);
  if (vals.length < 30) return null;

  const split = Math.floor((vals.length * 2) / 3);
  const first = vals.slice(0, split);
  const last = vals.slice(split);
  if (first.length === 0 || last.length === 0) return null;

  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return mean(first) - mean(last);
}

function buildDecodeContext(
  activity: ActivityRow,
  recentActivities: ActivityRow[],
  weather: WeatherData | null,
  hrDriftBpm: number | null,
): DecodeContext {
  const baseline = getRollingAvgSpeed(recentActivities, activity.strava_id);
  const baselineRunCount = getBaselineRunCount(
    recentActivities,
    activity.strava_id,
  );
  const heatAdj = weather
    ? weatherPaceAdjustment(weather.temperature, weather.humidity)
    : 0;

  const gain = activity.total_elevation_gain;
  const perKm =
    activity.distance > 0 ? gain / (activity.distance / 1000) : 0;

  return {
    paceComparison: paceVsBaseline(activity, baseline),
    paceDeltaPct: paceDeltaPercent(activity, baseline),
    todayPace: speedToPace(activity.average_speed),
    baselinePace: baseline > 0 ? speedToPace(baseline) : null,
    baselineRunCount,
    heatAdjPct: heatAdj > 0 ? heatAdj : null,
    hrDriftBpm,
    elevationGain: gain > 0 ? gain : null,
    elevationPerKm: gain > 0 ? perKm : null,
    conditionComparison: compareSimilarConditions(
      activity,
      recentActivities,
      weather,
    ),
  };
}

export async function decodeActivity(
  activity: ActivityRow,
  streams: StravaStreams | null | undefined,
  recentActivities: ActivityRow[],
): Promise<DecodeResult> {
  const insights: PaceInsight[] = [];
  let lat = 0;
  let lng = 0;

  if (activity.start_latlng) {
    try {
      const [la, lo] = JSON.parse(activity.start_latlng) as [number, number];
      lat = la;
      lng = lo;
    } catch {
      /* ignore */
    }
  }

  const weather =
    lat && lng ? await fetchWeatherAt(lat, lng, activity.start_date) : null;

  if (weather) {
    const adj = weatherPaceAdjustment(weather.temperature, weather.humidity);
    insights.push({
      icon: "🌡️",
      title: `${weather.temperature.toFixed(0)}°C · ${weather.humidity.toFixed(0)}% humidity`,
      body:
        adj > 2
          ? `${weather.description}. In these conditions, clock pace typically runs ~${adj.toFixed(0)}% slower than on a cool day — effort matters more than the stopwatch.`
          : `${weather.description}. Weather wasn't a major factor today.`,
      tone: adj > 4 ? "caution" : "neutral",
    });
  }

  if (activity.total_elevation_gain > 30) {
    const gain = activity.total_elevation_gain;
    const perKm =
      activity.distance > 0 ? gain / (activity.distance / 1000) : 0;
    insights.push({
      icon: "⛰️",
      title: `${Math.round(gain)}m elevation gain`,
      body:
        perKm > 15
          ? "Hilly route — expect pace to look slower even when effort is high."
          : "Some climbing today, which adds to perceived effort.",
      tone: "neutral",
    });
  }

  const hrDrift = computeHrDrift(streams);

  if (hrDrift != null) {
    if (hrDrift > 8) {
      insights.push({
        icon: "💓",
        title: `HR drifted +${hrDrift.toFixed(0)} bpm`,
        body: "Your heart rate rose in the second half at similar effort — classic fatigue or heat. Not a fitness problem.",
        tone: "caution",
      });
    } else if (hrDrift < -3) {
      insights.push({
        icon: "💓",
        title: "Strong second half",
        body: `HR was ${Math.abs(hrDrift).toFixed(0)} bpm lower late in the run — good pacing or improving fitness.`,
        tone: "positive",
      });
    } else {
      insights.push({
        icon: "💓",
        title: "Steady heart rate",
        body: "HR stayed consistent throughout — a sign of controlled effort.",
        tone: "positive",
      });
    }
  } else if (activity.average_heartrate) {
    insights.push({
      icon: "💓",
      title: `Avg HR ${Math.round(activity.average_heartrate)} bpm`,
      body:
        activity.average_heartrate > 160
          ? "Higher heart rate — likely a harder effort or warm conditions."
          : "Comfortable effort zone for an easy run.",
      tone: "neutral",
    });
  }

  const cadenceFade = computeCadenceFade(streams);
  if (cadenceFade != null) {
    if (cadenceFade >= 4) {
      insights.push({
        icon: "🦵",
        title: `Cadence faded ${cadenceFade.toFixed(0)} spm`,
        body: "Stride rate dropped in the last third — form fatigue. Shorten stride or ease off next time rather than forcing pace.",
        tone: "caution",
      });
    } else if (cadenceFade <= -3) {
      insights.push({
        icon: "🦵",
        title: "Cadence held up",
        body: `Stride rate was ${Math.abs(cadenceFade).toFixed(0)} spm higher late — strong form finish.`,
        tone: "positive",
      });
    }
  }

  const pace = speedToPace(activity.average_speed);
  insights.push({
    icon: "👟",
    title: `Avg pace ${pace}`,
    body: `${secondsToDuration(activity.moving_time)} over ${(activity.distance / 1000).toFixed(1)} km.`,
    tone: "neutral",
  });

  const ctx = buildDecodeContext(activity, recentActivities, weather, hrDrift);
  const { summary, stats } = buildVerdict(activity, ctx, activity.strava_id);

  return {
    version: DECODER_VERSION,
    verdict: summary,
    verdictStats: stats,
    insights,
    weather,
  };
}

function buildVerdictStats(
  ctx: DecodeContext,
  activity: ActivityRow,
): string[] {
  const stats: string[] = [];

  if (
    ctx.baselineRunCount >= 3 &&
    ctx.paceDeltaPct != null &&
    ctx.baselinePace
  ) {
    const absPct = Math.abs(ctx.paceDeltaPct);
    if (ctx.paceComparison === "typical") {
      stats.push(
        `Within ${absPct.toFixed(0)}% of your recent average (${ctx.todayPace})`,
      );
    } else if (ctx.paceDeltaPct > 0) {
      stats.push(
        `${absPct.toFixed(0)}% slower than your recent average — ${ctx.todayPace} today vs ${ctx.baselinePace} usual (last ${ctx.baselineRunCount} runs)`,
      );
    } else {
      stats.push(
        `${absPct.toFixed(0)}% faster than your recent average — ${ctx.todayPace} today vs ${ctx.baselinePace} usual (last ${ctx.baselineRunCount} runs)`,
      );
    }
  }

  if (ctx.conditionComparison) {
    stats.push(formatConditionComparison(ctx.conditionComparison));
  }

  if (ctx.hrDriftBpm != null && ctx.hrDriftBpm > 8) {
    stats.push(
      `HR drifted +${ctx.hrDriftBpm.toFixed(0)} bpm in the second half`,
    );
  }

  if (ctx.heatAdjPct != null && ctx.heatAdjPct > 3) {
    stats.push(
      `Heat/humidity may add ~${ctx.heatAdjPct.toFixed(0)}% to expected clock pace`,
    );
  }

  if (ctx.elevationGain != null && ctx.elevationGain > 50) {
    const perKm =
      ctx.elevationPerKm != null
        ? ` (~${Math.round(ctx.elevationPerKm)}m/km)`
        : "";
    stats.push(`${Math.round(ctx.elevationGain)}m climbed${perKm}`);
  }

  if (activity.average_heartrate && activity.average_heartrate < 150) {
    stats.push(
      `Avg HR ${Math.round(activity.average_heartrate)} bpm — easy effort`,
    );
  }

  return stats;
}

function buildVerdict(
  activity: ActivityRow,
  ctx: DecodeContext,
  seed: number,
): { summary: string; stats: string[] } {
  const hasHeat = ctx.heatAdjPct != null && ctx.heatAdjPct > 3;
  const hasDrift = ctx.hrDriftBpm != null && ctx.hrDriftBpm > 8;
  const hasHills =
    ctx.elevationGain != null && ctx.elevationGain > 50;
  const { paceComparison } = ctx;

  let summary: string;

  if (paceComparison === "faster" && !hasDrift) {
    summary = pickVariant(
      [
        "Quicker than your recent average — nice work.",
        "Faster than your usual lately. Strong day.",
        "Ahead of your recent pace. Well run.",
      ],
      seed,
    );
  } else if (hasHeat && hasDrift) {
    if (paceComparison === "slower") {
      summary = pickVariant(
        [
          "Heat and rising HR explain the slower clock — solid effort for the conditions.",
          "Warm day with cardiac drift — the numbers tell the real story. Good effort.",
          "Below your usual pace, but heat and HR drift account for most of it.",
        ],
        seed,
      );
    } else {
      summary = pickVariant(
        [
          "Warm day with some cardiac drift — nothing concerning. Effort looked right.",
          "Heat and rising HR showed up, but your pace was in line with recent runs.",
          "Typical warm-weather effort — HR drifted a bit, but nothing to worry about.",
        ],
        seed,
      );
    }
  } else if (hasHeat) {
    if (paceComparison === "slower") {
      summary = pickVariant(
        [
          "A bit off your usual pace — the heat likely accounts for most of that.",
          "Slower clock today; warm conditions are the likely culprit.",
          "Below your usual pace — the heat is doing a lot of the work.",
        ],
        seed,
      );
    } else {
      summary = pickVariant(
        [
          "Warm one — don't read too much into the clock today.",
          "Heat was a factor, but your effort looked appropriate.",
          "Warm conditions today — focus on how it felt, not the stopwatch.",
        ],
        seed,
      );
    }
  } else if (hasDrift) {
    summary = pickVariant(
      [
        "HR crept up in the second half — normal fatigue, not a fitness issue.",
        "Some cardiac drift late in the run — classic sign of steady effort in warm or tired legs.",
        "Heart rate rose through the run — effort was honest, nothing to stress about.",
      ],
      seed,
    );
  } else if (hasHills) {
    summary = pickVariant(
      [
        "Solid hilly run — slower pace on climbs is expected.",
        "Good effort on a hilly route — the climbs did their thing.",
        "Hilly day — pace on paper undersells the work you did.",
      ],
      seed,
    );
  } else if (activity.average_heartrate && activity.average_heartrate < 150) {
    summary = pickVariant(
      [
        "Nice easy run — the kind of day that builds your base safely.",
        "Comfortable effort — exactly the kind of run that adds up over time.",
        "Easy day done right. Keep stacking these.",
      ],
      seed,
    );
  } else if (paceComparison === "slower") {
    summary = pickVariant(
      [
        "A touch slower than your recent average — could be fatigue, weather, or just an off day.",
        "Slightly off your usual pace lately. No big deal — one run doesn't define fitness.",
        "Below your recent average today. Worth noting, not worth stressing over.",
      ],
      seed,
    );
  } else {
    summary = pickVariant(
      [
        "Good run logged. Keep stacking consistent weeks.",
        "Solid effort. Consistency beats any single run.",
        "Another run in the bank — keep showing up.",
      ],
      seed,
    );
  }

  return { summary, stats: buildVerdictStats(ctx, activity) };
}
