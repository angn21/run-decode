import { NextRequest, NextResponse } from "next/server";
import { isProductionDbConfigured } from "@/lib/db-config";
import { getAppUrl } from "@/lib/app-url";
import { exchangeCodeForToken, syncActivities, upsertAthleteFromToken } from "@/lib/strava";
import { setAthleteSession } from "@/lib/session";
import type { AthleteRow } from "@/lib/db";

function classifyError(message: string): string {
  if (message.includes("ATHLETE_CAPACITY_FULL")) return "capacity_full";
  if (message.includes("DB_NOT_CONFIGURED")) return "db_not_configured";
  if (
    message.includes("redirect_uri") ||
    message.includes('"field":"redirect_uri"')
  ) {
    return "redirect_mismatch";
  }
  if (message.includes("OAuth token exchange failed")) return "token_exchange";
  if (message.includes("Turso") || message.includes("SQLITE")) return "db_error";
  return "auth_failed";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const appUrl = getAppUrl();

  if (error) {
    return NextResponse.redirect(`${appUrl}/?error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/?error=no_code`);
  }

  if (!isProductionDbConfigured()) {
    return NextResponse.redirect(`${appUrl}/?error=db_not_configured`);
  }

  let athlete: AthleteRow;
  try {
    const tokenData = await exchangeCodeForToken(code);
    athlete = await upsertAthleteFromToken(tokenData);
    await setAthleteSession(athlete.id);
  } catch (e) {
    console.error("OAuth callback error:", e);
    const message = e instanceof Error ? e.message : "";
    const errorCode = classifyError(message);
    return NextResponse.redirect(`${appUrl}/?error=${errorCode}`);
  }

  try {
    await syncActivities(athlete, 5);
    return NextResponse.redirect(`${appUrl}/?synced=1`);
  } catch (syncErr) {
    console.error("Post-auth sync error:", syncErr);
    return NextResponse.redirect(`${appUrl}/?synced=1&sync_warning=1`);
  }
}
