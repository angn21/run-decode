import type { ActivityRow, AthleteRow } from "./db";
import {
  decodeActivity,
  isCachedDecodeValid,
  type CachedDecodeResult,
} from "./decoder";
import {
  fetchActivityStreams,
  getActivitiesForAthlete,
  getActivityForAthlete,
  saveInsights,
  saveStreams,
} from "./strava";

const DEFAULT_DELAY_MS = 1300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch streams + Pace Decoder insights for the given Strava activity IDs. */
export async function analyzeActivities(
  athlete: AthleteRow,
  stravaIds: number[],
  options: { max?: number; delayMs?: number } = {},
): Promise<{ analyzed: number; insightsSaved: number; remaining: number }> {
  const max = options.max ?? 10;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const batch = stravaIds.slice(0, max);
  const remaining = Math.max(0, stravaIds.length - batch.length);

  const recentActivities = (await getActivitiesForAthlete(
    athlete.id,
    50,
  )) as ActivityRow[];

  let analyzed = 0;
  let insightsSaved = 0;

  for (let i = 0; i < batch.length; i++) {
    const stravaId = batch[i];
    try {
      let activity = await getActivityForAthlete(stravaId, athlete.id);
      if (!activity) continue;

      let streams = activity.streams_json
        ? (JSON.parse(activity.streams_json) as Awaited<
            ReturnType<typeof fetchActivityStreams>
          >)
        : null;

      if (!streams) {
        streams = await fetchActivityStreams(athlete, stravaId);
        await saveStreams(stravaId, streams);
        analyzed++;
        activity = (await getActivityForAthlete(stravaId, athlete.id))!;
      }

      const cached = activity.insights_json
        ? (JSON.parse(activity.insights_json) as CachedDecodeResult)
        : null;
      if (!isCachedDecodeValid(cached)) {
        const result = await decodeActivity(
          activity,
          streams,
          recentActivities,
        );
        await saveInsights(stravaId, result);
        insightsSaved++;
      }
    } catch (e) {
      console.error(`analyzeActivities failed for ${stravaId}:`, e);
    }

    if (i < batch.length - 1) {
      await sleep(delayMs);
    }
  }

  return { analyzed, insightsSaved, remaining };
}
