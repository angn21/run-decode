import type { ActivityRow } from "./db";
import { speedToPace, secondsToDuration } from "./format";
import {
  getRollingAvgSpeed,
  paceVsBaseline,
  type PaceComparison,
} from "./run-baseline";
import type { StravaStreams } from "./strava";
import {
  fetchWeatherAt,
  weatherPaceAdjustment,
  type WeatherData,
} from "./weather";

export const DECODER_VERSION = 2;

export type PaceInsight = {
  icon: string;
  title: string;
  body: string;
  tone: "neutral" | "positive" | "caution";
};

export type DecodeResult = {
  version: number;
  verdict: string;
  insights: PaceInsight[];
  weather: WeatherData | null;
};

export type CachedDecodeResult = DecodeResult & { version?: number };

export function isCachedDecodeValid(
  cached: CachedDecodeResult | null,
): cached is CachedDecodeResult {
  return !!cached && (cached.version ?? 0) >= DECODER_VERSION;
}

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

  if (streams?.heartrate?.data && streams?.distance?.data) {
    const hr = streams.heartrate.data as number[];
    const dist = streams.distance.data as number[];
    const midDist = dist[dist.length - 1] / 2;
    const midIdx = dist.findIndex((d) => d >= midDist);

    if (midIdx > 0) {
      const hrFirst = avgHrInRange(hr, 0, midIdx);
      const hrSecond = avgHrInRange(hr, midIdx, hr.length);
      if (hrFirst && hrSecond) {
        const drift = hrSecond - hrFirst;
        if (drift > 8) {
          insights.push({
            icon: "💓",
            title: `HR drifted +${drift.toFixed(0)} bpm`,
            body: "Your heart rate rose in the second half at similar effort — classic fatigue or heat. Not a fitness problem.",
            tone: "caution",
          });
        } else if (drift < -3) {
          insights.push({
            icon: "💓",
            title: "Strong second half",
            body: `HR was ${Math.abs(drift).toFixed(0)} bpm lower late in the run — good pacing or improving fitness.`,
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
      }
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

  const pace = speedToPace(activity.average_speed);
  insights.push({
    icon: "👟",
    title: `Avg pace ${pace}`,
    body: `${secondsToDuration(activity.moving_time)} over ${(activity.distance / 1000).toFixed(1)} km.`,
    tone: "neutral",
  });

  const baseline = getRollingAvgSpeed(recentActivities, activity.strava_id);
  const comparison = paceVsBaseline(activity, baseline);

  const verdict = buildVerdict(
    activity,
    weather,
    insights,
    comparison,
    activity.strava_id,
  );

  return { version: DECODER_VERSION, verdict, insights, weather };
}

function buildVerdict(
  activity: ActivityRow,
  weather: WeatherData | null,
  insights: PaceInsight[],
  paceComparison: PaceComparison,
  seed: number,
): string {
  const hasHeat =
    weather != null &&
    weatherPaceAdjustment(weather.temperature, weather.humidity) > 3;
  const hasDrift = insights.some((i) => i.title.includes("drifted"));
  const hasHills = activity.total_elevation_gain > 50;

  if (paceComparison === "faster" && !hasDrift) {
    return pickVariant(
      [
        "Quicker than your recent average — nice work.",
        "Faster than your usual lately. Strong day.",
        "Ahead of your recent pace. Well run.",
      ],
      seed,
    );
  }

  if (hasHeat && hasDrift) {
    if (paceComparison === "slower") {
      return pickVariant(
        [
          "Slower than your recent average, but heat and rising HR explain it — solid effort for the conditions.",
          "Off your usual pace today, though the warmth and HR drift tell the real story. Good effort.",
          "Below your recent average on the clock, but heat and cardiac drift account for most of it.",
        ],
        seed,
      );
    }
    return pickVariant(
      [
        "Warm day with some cardiac drift — nothing concerning. Effort looked right.",
        "Heat and rising HR showed up, but your pace was in line with recent runs. All good.",
        "Typical warm-weather effort — HR drifted a bit, but nothing to worry about.",
      ],
      seed,
    );
  }

  if (hasHeat) {
    if (paceComparison === "slower") {
      return pickVariant(
        [
          "A bit off your usual pace, but the heat accounts for most of that.",
          "Slower than your recent average — warm conditions are the likely culprit.",
          "Below your usual pace today; the heat is doing a lot of the work.",
        ],
        seed,
      );
    }
    return pickVariant(
      [
        "Warm one — don't read too much into the clock today.",
        "Heat was a factor, but your effort looked appropriate.",
        "Warm conditions today — focus on how it felt, not the stopwatch.",
      ],
      seed,
    );
  }

  if (hasDrift) {
    return pickVariant(
      [
        "HR crept up in the second half — normal fatigue, not a fitness issue.",
        "Some cardiac drift late in the run — classic sign of a steady effort in warm or tired legs.",
        "Heart rate rose through the run — effort was honest, nothing to stress about.",
      ],
      seed,
    );
  }

  if (hasHills) {
    return pickVariant(
      [
        "Solid hilly run. Slower pace on climbs is expected — you put in real work.",
        "Good effort on a hilly route — the climbs did their thing.",
        "Hilly day — pace on paper undersells the work you did.",
      ],
      seed,
    );
  }

  if (activity.average_heartrate && activity.average_heartrate < 150) {
    return pickVariant(
      [
        "Nice easy run. This is the kind of day that builds your base safely.",
        "Comfortable effort — exactly the kind of run that adds up over time.",
        "Easy day done right. Keep stacking these.",
      ],
      seed,
    );
  }

  if (paceComparison === "slower") {
    return pickVariant(
      [
        "A touch slower than your recent average — could be fatigue, weather, or just an off day.",
        "Slightly off your usual pace lately. No big deal — one run doesn't define fitness.",
        "Below your recent average today. Worth noting, not worth stressing over.",
      ],
      seed,
    );
  }

  return pickVariant(
    [
      "Good run logged. Keep stacking consistent weeks.",
      "Solid effort. Consistency beats any single run.",
      "Another run in the bank — keep showing up.",
    ],
    seed,
  );
}
