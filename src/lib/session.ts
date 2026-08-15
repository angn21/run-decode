import { cookies } from "next/headers";
import { dbGet, type AthleteRow } from "./db";
import { seedAthleteFromEnv } from "./strava";
import { signAthleteId, verifyAthleteSession } from "./session-token";

const COOKIE_NAME = "rd_athlete";

function sessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() ?? "";
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    // https://nextjs.org/docs/app/api-reference/functions/cookies#options
    secure: process.env.NODE_ENV === "production",
  };
}

export async function getCurrentAthlete(): Promise<AthleteRow | null> {
  const cookieStore = await cookies();
  const athleteId = verifyAthleteSession(
    cookieStore.get(COOKIE_NAME)?.value,
    sessionSecret(),
  );

  if (athleteId) {
    try {
      const row = await dbGet<AthleteRow>("SELECT * FROM athletes WHERE id = ?", [
        athleteId,
      ]);
      if (row) return row;
    } catch (e) {
      console.error("getCurrentAthlete db error:", e);
      return null;
    }
  }

  if (!process.env.VERCEL) {
    return seedAthleteFromEnv();
  }

  return null;
}

export async function setAthleteSession(athleteDbId: number) {
  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_NAME,
    signAthleteId(athleteDbId, sessionSecret()),
    sessionCookieOptions(),
  );
}

export async function clearAthleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
