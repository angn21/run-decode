import { NextResponse } from "next/server";
import { getAppUrl, getOAuthRedirectUri } from "@/lib/app-url";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getOAuthRedirectUri(),
    response_type: "code",
    approval_prompt: "force",
    scope: "read,activity:read_all,profile:read_all",
  });

  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params}`,
  );
}
