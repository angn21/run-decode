import { NextResponse } from "next/server";
import { isProductionDbConfigured } from "@/lib/db-config";
import { dbAll, type ActivityRow } from "@/lib/db";
import {
  decodeActivity,
  isCachedDecodeValid,
  type CachedDecodeResult,
} from "@/lib/decoder";
import { getCurrentAthlete } from "@/lib/session";
import {
  fetchActivityStreams,
  getActivitiesForAthlete,
  getActivityForAthlete,
  saveInsights,
  saveStreams,
} from "@/lib/strava";

const BATCH_SIZE = 20;
const DELAY_MS = 1300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  if (!isProductionDbConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  const athlete = await getCurrentAthlete();
  if (!athlete) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const missing = await dbAll<{ strava_id: number }>(
    `SELECT strava_id FROM activities
     WHERE athlete_id = ? AND (type = 'Run' OR sport_type = 'Run')
       AND (streams_json IS NULL OR streams_json = '')
     ORDER BY start_date DESC`,
    [athlete.id],
  );

  const totalRow = await dbAll<{ n: number }>(
    `SELECT COUNT(*) as n FROM activities
     WHERE athlete_id = ? AND (type = 'Run' OR sport_type = 'Run')`,
    [athlete.id],
  );
  const total = totalRow[0]?.n ?? 0;
  const withStreams = total - missing.length;

  if (missing.length === 0) {
    return NextResponse.json({
      done: true,
      remaining: 0,
      fetched: 0,
      insightsSaved: 0,
      withStreams,
      total,
    });
  }

  const recentActivities = (await getActivitiesForAthlete(
    athlete.id,
    50,
  )) as ActivityRow[];

  const batch = missing.slice(0, BATCH_SIZE);
  let fetched = 0;
  let insightsSaved = 0;
  let errors = 0;

  for (let i = 0; i < batch.length; i++) {
    const { strava_id } = batch[i];
    try {
      const streams = await fetchActivityStreams(athlete, strava_id);
      await saveStreams(strava_id, streams);
      fetched++;

      const activity = await getActivityForAthlete(strava_id, athlete.id);
      if (activity) {
        const cached = activity.insights_json
          ? (JSON.parse(activity.insights_json) as CachedDecodeResult)
          : null;
        if (!isCachedDecodeValid(cached)) {
          const result = await decodeActivity(
            activity,
            streams,
            recentActivities,
          );
          await saveInsights(strava_id, result);
          insightsSaved++;
        }
      }
    } catch (e) {
      console.error(`Stream backfill failed for ${strava_id}:`, e);
      errors++;
    }
    if (i < batch.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const remaining = missing.length - batch.length;

  return NextResponse.json({
    done: remaining === 0,
    remaining,
    fetched,
    insightsSaved,
    errors,
    withStreams: withStreams + fetched,
    total,
  });
}
