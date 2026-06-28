import { NextResponse } from "next/server";
import { getCurrentAthlete } from "@/lib/session";
import { seedAthleteFromEnv, syncActivities } from "@/lib/strava";

export async function POST() {
  let athlete = await getCurrentAthlete();
  if (!athlete && !process.env.VERCEL) {
    athlete = await seedAthleteFromEnv();
  }

  if (!athlete) {
    return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });
  }

  try {
    const count = await syncActivities(athlete, 5);
    return NextResponse.json({ synced: count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("Sync error:", e);

    if (message.includes("activity:read_permission") || message.includes("activity:read_all")) {
      return NextResponse.json(
        {
          error:
            "Your token is missing activity read permission. Use “Connect with Strava” on the home page (manual API tokens from Strava settings often can’t read activities).",
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
