import type { NextRequest } from "next/server";

/** Canonical app URL with no trailing slash — must match Strava redirect_uri exactly. */
export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Prefer the request host on Vercel so mobile/desktop use the same redirect URI. */
export function getAppUrlFromRequest(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();

  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (host && (host.includes("vercel.app") || host.includes("localhost"))) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  return getAppUrl();
}

export function getOAuthRedirectUri(request?: NextRequest): string {
  const base = request ? getAppUrlFromRequest(request) : getAppUrl();
  return `${base}/api/auth/callback`;
}

export const OAUTH_REDIRECT_COOKIE = "rd_oauth_redirect";
