import { randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "rd_oauth_state";

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function oauthStateMatches(
  cookieValue: string | undefined,
  queryValue: string | null | undefined,
): boolean {
  if (!cookieValue || !queryValue) return false;
  const left = Buffer.from(cookieValue);
  const right = Buffer.from(queryValue);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
