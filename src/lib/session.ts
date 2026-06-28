import { cookies } from "next/headers";
import { dbGet, type AthleteRow } from "./db";
import { seedAthleteFromEnv } from "./strava";

const COOKIE_NAME = "rd_athlete";

export async function getCurrentAthlete(): Promise<AthleteRow | null> {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get(COOKIE_NAME)?.value;

  if (athleteId) {
    try {
      const row = await dbGet<AthleteRow>("SELECT * FROM athletes WHERE id = ?", [
        Number(athleteId),
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
  cookieStore.set(COOKIE_NAME, String(athleteDbId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearAthleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
