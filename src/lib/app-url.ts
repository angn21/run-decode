/** Canonical app URL with no trailing slash — must match Strava redirect_uri exactly. */
export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function getOAuthRedirectUri(): string {
  return `${getAppUrl()}/api/auth/callback`;
}
