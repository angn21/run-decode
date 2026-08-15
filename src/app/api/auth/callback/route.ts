import { NextRequest, NextResponse } from "next/server";
import { isProductionDbConfigured } from "@/lib/db-config";
import {
  getAppUrlFromRequest,
  getOAuthRedirectUri,
  OAUTH_REDIRECT_COOKIE,
} from "@/lib/app-url";
import { oauthStateMatches, OAUTH_STATE_COOKIE } from "@/lib/oauth-state";
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
  if (
    message.includes('"field":"code"') ||
    (message.includes("invalid") && message.includes("AuthorizationCode"))
  ) {
    return "code_expired";
  }
  if (message.includes("OAuth token exchange failed")) return "token_exchange";
  if (message.includes("Turso") || message.includes("SQLITE")) return "db_error";
  return "auth_failed";
}

function clearOauthCookies(response: NextResponse) {
  response.cookies.delete(OAUTH_REDIRECT_COOKIE);
  response.cookies.delete(OAUTH_STATE_COOKIE);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const appUrl = getAppUrlFromRequest(request);

  if (error) {
    const response = NextResponse.redirect(`${appUrl}/?error=${error}`);
    clearOauthCookies(response);
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(`${appUrl}/?error=no_code`);
    clearOauthCookies(response);
    return response;
  }

  if (
    !oauthStateMatches(
      request.cookies.get(OAUTH_STATE_COOKIE)?.value,
      request.nextUrl.searchParams.get("state"),
    )
  ) {
    const response = NextResponse.redirect(`${appUrl}/?error=oauth_state`);
    clearOauthCookies(response);
    return response;
  }

  if (!isProductionDbConfigured()) {
    const response = NextResponse.redirect(`${appUrl}/?error=db_not_configured`);
    clearOauthCookies(response);
    return response;
  }

  const redirectUri =
    request.cookies.get(OAUTH_REDIRECT_COOKIE)?.value ||
    getOAuthRedirectUri(request);

  let athlete: AthleteRow;
  try {
    const tokenData = await exchangeCodeForToken(code, redirectUri);
    athlete = await upsertAthleteFromToken(tokenData);
    await setAthleteSession(athlete.id);
  } catch (e) {
    console.error("OAuth callback error:", e);
    const message = e instanceof Error ? e.message : "";
    const errorCode = classifyError(message);
    const response = NextResponse.redirect(`${appUrl}/?error=${errorCode}`);
    clearOauthCookies(response);
    return response;
  }

  try {
    await syncActivities(athlete, 5);
    const response = NextResponse.redirect(`${appUrl}/?synced=1`);
    clearOauthCookies(response);
    return response;
  } catch (syncErr) {
    console.error("Post-auth sync error:", syncErr);
    const response = NextResponse.redirect(`${appUrl}/?synced=1&sync_warning=1`);
    clearOauthCookies(response);
    return response;
  }
}
