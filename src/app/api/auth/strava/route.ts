import { NextRequest, NextResponse } from "next/server";
import { getOAuthRedirectUri, OAUTH_REDIRECT_COOKIE } from "@/lib/app-url";
import { createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/oauth-state";

function oauthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function GET(request: NextRequest) {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();

  if (!clientId) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  const redirectUri = getOAuthRedirectUri(request);
  const state = createOAuthState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all,profile:read_all",
    state,
  });

  const response = NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params}`,
  );

  const cookieOpts = oauthCookieOptions();
  response.cookies.set(OAUTH_REDIRECT_COOKIE, redirectUri, cookieOpts);
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOpts);

  return response;
}
