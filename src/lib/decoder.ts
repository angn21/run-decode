import type { ActivityRow } from "./db";
import { speedToPace, secondsToDuration } from "./format";
import type { StravaStreams } from "./strava";
import {
  fetchWeatherAt,
  weatherPaceAdjustment,
  type WeatherData,
} from "./weather";

export type PaceInsight = {
  icon: string;
  title: string;
  body: string;
  tone: "neutral" | "positive" | "caution";
};

export type DecodeResult = {
  verdict: string;
  insights: PaceInsight[];
  weather: WeatherData | null;
};

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
  streams?: StravaStreams | null,
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
          ? `${weather.description}. In these conditions, pace typically runs ~${adj.toFixed(0)}% slower than on a cool day — effort matters more than the clock.`
          : `${weather.description}. Weather wasn't a major factor today.`,
      tone: adj > 4 ? "caution" : "neutral",
    });
  }

  if (activity.total_elevation_gain > 30) {
    const gain = activity.total_elevation_gain;
    const perKm =
      activity.distance > 0
        ? gain / (activity.distance / 1000)
        : 0;
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

  const verdict = buildVerdict(activity, weather, insights);
  return { verdict, insights, weather };
}

function buildVerdict(
  activity: ActivityRow,
  weather: WeatherData | null,
  insights: PaceInsight[],
): string {
  const hasHeat =
    weather && weatherPaceAdjustment(weather.temperature, weather.humidity) > 3;
  const hasDrift = insights.some((i) => i.title.includes("drifted"));
  const hasHills = activity.total_elevation_gain > 50;

  if (hasHeat && hasDrift) {
    return "Pace looked slow, but heat and rising HR explain it — effort was normal for the conditions.";
  }
  if (hasHeat) {
    return "Don't read too much into the pace — it was a warm one. Effort looked appropriate.";
  }
  if (hasHills) {
    return "Solid hilly run. Slower pace on climbs is expected — you put in real work.";
  }
  if (activity.average_heartrate && activity.average_heartrate < 150) {
    return "Nice easy run. This is the kind of day that builds your base safely.";
  }
  return "Good run logged. Keep stacking consistent weeks.";
}
