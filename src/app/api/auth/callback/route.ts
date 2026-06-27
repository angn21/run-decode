import { NextRequest, NextResponse } from "next/server";
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

  try {
    const tokenData = await exchangeCodeForToken(code);
    const athlete = await upsertAthleteFromToken(tokenData);
    await setAthleteSession(athlete.id);
    await syncActivities(athlete, 5);
    return NextResponse.redirect(`${appUrl}/?synced=1`);
  } catch (e) {
    console.error("OAuth callback error:", e);
    return NextResponse.redirect(`${appUrl}/?error=auth_failed`);
  }
}
