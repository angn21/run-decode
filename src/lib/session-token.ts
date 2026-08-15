import { createHmac, timingSafeEqual } from "node:crypto";

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** HMAC-signed athlete id for the session cookie. */
export function signAthleteId(id: number, secret: string): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid athlete id");
  }
  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }
  const payload = String(id);
  return `${payload}.${hmac(payload, secret)}`;
}

/** Returns the athlete id or null if the cookie is missing, unsigned, or tampered. */
export function verifyAthleteSession(
  value: string | undefined,
  secret: string,
): number | null {
  if (!value || !secret) return null;

  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;

  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = hmac(payload, secret);
  if (!safeEqual(sig, expected)) return null;

  const id = Number(payload);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
