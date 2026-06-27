import { cookies } from "next/headers";
import { getDb, type AthleteRow } from "./db";
import { seedAthleteFromEnv } from "./strava";

const COOKIE_NAME = "rd_athlete";

export async function getCurrentAthlete(): Promise<AthleteRow | null> {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get(COOKIE_NAME)?.value;

  if (athleteId) {
    const row = getDb()
      .prepare("SELECT * FROM athletes WHERE id = ?")
      .get(Number(athleteId)) as AthleteRow | undefined;
    if (row) return row;
  }

  // Env-seeded or returning user without cookie — read from DB (no cookie write here;
  // Server Components cannot modify cookies; OAuth callback sets the cookie instead).
  const fromDb = getDb().prepare("SELECT * FROM athletes LIMIT 1").get() as
    | AthleteRow
    | undefined;
  if (fromDb) return fromDb;

  return seedAthleteFromEnv();
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
