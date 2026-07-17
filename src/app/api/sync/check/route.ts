import { NextRequest, NextResponse } from "next/server";
import { analyzeActivities } from "@/lib/analyze-activity";
import { isProductionDbConfigured } from "@/lib/db-config";
import { getCurrentAthlete } from "@/lib/session";
import {
  fetchLatestStravaRun,
  getActivityForAthlete,
  seedAthleteFromEnv,
  syncAthleteGears,
  syncNewActivities,
  touchAthleteSynced,
} from "@/lib/strava";

const THROTTLE_SECONDS = 10 * 60;
const ANALYZE_BATCH = 10;

export async function POST(request: NextRequest) {
  if (!isProductionDbConfigured()) {
    return NextResponse.json(
      {
        error:
          "Database not configured. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to Vercel.",
      },
      { status: 503 },
    );
  }

  let athlete = await getCurrentAthlete();
  if (!athlete && !process.env.VERCEL) {
    athlete = await seedAthleteFromEnv();
  }
  if (!athlete) {
    return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });
  }

  let force = false;
  let analyzeIds: number[] = [];
  try {
    const body = (await request.json()) as {
      force?: boolean;
      analyzeIds?: number[];
    };
    force = !!body.force;
    if (Array.isArray(body.analyzeIds)) {
      analyzeIds = body.analyzeIds.filter((id) => Number.isFinite(id));
    }
  } catch {
    /* empty body is fine */
  }

  try {
    // Continue analyzing a previous batch (no Strava list call)
    if (analyzeIds.length > 0) {
      const { analyzed, insightsSaved, remaining } = await analyzeActivities(
        athlete,
        analyzeIds,
        { max: ANALYZE_BATCH },
      );
      return NextResponse.json({
        upToDate: false,
        throttled: false,
        synced: 0,
        analyzed,
        insightsSaved,
        remaining,
        pendingAnalyzeIds: analyzeIds.slice(ANALYZE_BATCH),
      });
    }

    const now = Math.floor(Date.now() / 1000);
    if (
      !force &&
      athlete.synced_at != null &&
      now - athlete.synced_at < THROTTLE_SECONDS
    ) {
      return NextResponse.json({
        upToDate: true,
        throttled: true,
        synced: 0,
        analyzed: 0,
        insightsSaved: 0,
        remaining: 0,
        pendingAnalyzeIds: [],
      });
    }

    const latestStrava = await fetchLatestStravaRun(athlete);

    if (!latestStrava) {
      await touchAthleteSynced(athlete.id);
      return NextResponse.json({
        upToDate: true,
        throttled: false,
        synced: 0,
        analyzed: 0,
        insightsSaved: 0,
        remaining: 0,
        pendingAnalyzeIds: [],
        message: "No runs on Strava",
      });
    }

    const latestInDb = await getActivityForAthlete(
      latestStrava.id,
      athlete.id,
    );

    if (latestInDb) {
      await touchAthleteSynced(athlete.id);
      if (force) {
        await syncAthleteGears(athlete);
      }
      // If latest exists but still needs streams (e.g. sync without analyze), finish it
      if (!latestInDb.streams_json) {
        const { analyzed, insightsSaved, remaining } = await analyzeActivities(
          athlete,
          [latestStrava.id],
          { max: ANALYZE_BATCH },
        );
        return NextResponse.json({
          upToDate: analyzed > 0 || insightsSaved > 0 ? false : true,
          throttled: false,
          synced: 0,
          analyzed,
          insightsSaved,
          remaining,
          pendingAnalyzeIds: [],
        });
      }
      return NextResponse.json({
        upToDate: true,
        throttled: false,
        synced: 0,
        analyzed: 0,
        insightsSaved: 0,
        remaining: 0,
        pendingAnalyzeIds: [],
      });
    }

    const { synced, newStravaIds } = await syncNewActivities(athlete, 3);

    const { analyzed, insightsSaved, remaining } = await analyzeActivities(
      athlete,
      newStravaIds,
      { max: ANALYZE_BATCH },
    );

    return NextResponse.json({
      upToDate: false,
      throttled: false,
      synced,
      newRuns: newStravaIds.length,
      analyzed,
      insightsSaved,
      remaining,
      pendingAnalyzeIds: newStravaIds.slice(ANALYZE_BATCH),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync check failed";
    console.error("Sync check error:", e);

    if (
      message.includes("activity:read_permission") ||
      message.includes("activity:read_all")
    ) {
      return NextResponse.json(
        {
          error:
            "Your token is missing activity read permission. Use “Connect with Strava” on the home page.",
        },
        { status: 403 },
      );
    }

    if (message.includes("401")) {
      return NextResponse.json(
        {
          error:
            "Strava authorization expired or invalid. Click “Connect with Strava” to re-authorize.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
