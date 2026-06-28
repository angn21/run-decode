import { NextRequest, NextResponse } from "next/server";
import { getOAuthRedirectUri, OAUTH_REDIRECT_COOKIE } from "@/lib/app-url";

export async function GET(request: NextRequest) {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();

  if (!clientId) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  const redirectUri = getOAuthRedirectUri(request);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all,profile:read_all",
  });

  const response = NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params}`,
  );

  response.cookies.set(OAUTH_REDIRECT_COOKIE, redirectUri, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
