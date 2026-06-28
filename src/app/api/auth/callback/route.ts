import { NextRequest, NextResponse } from "next/server";
import { isProductionDbConfigured } from "@/lib/db-config";
import { exchangeCodeForToken, syncActivities, upsertAthleteFromToken } from "@/lib/strava";
import { setAthleteSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${appUrl}/?error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/?error=no_code`);
  }

  if (!isProductionDbConfigured()) {
    return NextResponse.redirect(`${appUrl}/?error=db_not_configured`);
  }

  try {
    const tokenData = await exchangeCodeForToken(code);
    const athlete = await upsertAthleteFromToken(tokenData);
    await setAthleteSession(athlete.id);
    await syncActivities(athlete, 5);
    return NextResponse.redirect(`${appUrl}/?synced=1`);
  } catch (e) {
    console.error("OAuth callback error:", e);
    const message = e instanceof Error ? e.message : "";
    if (message.includes("ATHLETE_CAPACITY_FULL")) {
      return NextResponse.redirect(`${appUrl}/?error=capacity_full`);
    }
    if (message.includes("DB_NOT_CONFIGURED")) {
      return NextResponse.redirect(`${appUrl}/?error=db_not_configured`);
    }
    return NextResponse.redirect(`${appUrl}/?error=auth_failed`);
  }
}
