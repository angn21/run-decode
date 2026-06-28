import { dbAll, dbGet, dbRun, type ActivityRow, type AthleteRow } from "./db";

const STRAVA_API = "https://www.strava.com/api/v3";

/** Strava tokens last ~6h; default so seed-from-env never writes null expires_at. */
function resolveExpiresAt(raw?: string | number | null): number {
  const parsed =
    typeof raw === "number" ? raw : Number(raw ?? Number.NaN);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return Math.floor(Date.now() / 1000) + 6 * 60 * 60;
}

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  map?: { summary_polyline?: string };
  start_latlng?: [number, number];
  suffer_score?: number;
};

export type StravaStreams = Record<
  string,
  { data: number[] | [number, number][]; series_type: string; original_size: number }
>;

async function refreshTokenIfNeeded(athlete: AthleteRow): Promise<AthleteRow> {
  const now = Math.floor(Date.now() / 1000);
  if (athlete.expires_at > now + 60) return athlete;

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: athlete.refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  await dbRun(
    `UPDATE athletes SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = ?`,
    [data.access_token, data.refresh_token, data.expires_at, athlete.id],
  );

  return {
    ...athlete,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

async function stravaFetch<T>(
  athlete: AthleteRow,
  path: string,
): Promise<T> {
  const fresh = await refreshTokenIfNeeded(athlete);
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${fresh.access_token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API ${path}: ${res.status} ${text}`);
  }

  return res.json();
}

function isAthleteCapacityError(status: number, body: string): boolean {
  if (status !== 403 && status !== 400) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("limit of connected athletes") ||
    lower.includes("athlete limit") ||
    lower.includes("maximum number of athletes")
  );
}

export async function exchangeCodeForToken(code: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${appUrl}/api/auth/callback`,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (isAthleteCapacityError(res.status, text)) {
      throw new Error(
        "ATHLETE_CAPACITY_FULL: This app has reached Strava's athlete limit (10 connected athletes). Ask the app owner to remove an existing connection in Strava API settings.",
      );
    }
    throw new Error(`OAuth token exchange failed: ${res.status} ${text}`);
  }

  return JSON.parse(text);
}

export async function upsertAthleteFromToken(tokenData: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
  };
}): Promise<AthleteRow> {
  const expiresAt = resolveExpiresAt(tokenData.expires_at);
  const existing = await dbGet<AthleteRow>(
    "SELECT * FROM athletes WHERE strava_id = ?",
    [tokenData.athlete.id],
  );

  if (existing) {
    await dbRun(
      `UPDATE athletes SET access_token = ?, refresh_token = ?, expires_at = ?,
       firstname = ?, lastname = ?, profile = ? WHERE id = ?`,
      [
        tokenData.access_token,
        tokenData.refresh_token,
        expiresAt,
        tokenData.athlete.firstname,
        tokenData.athlete.lastname,
        tokenData.athlete.profile,
        existing.id,
      ],
    );
    return {
      ...existing,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      firstname: tokenData.athlete.firstname,
      lastname: tokenData.athlete.lastname,
      profile: tokenData.athlete.profile,
    };
  }

  const result = await dbRun(
    `INSERT INTO athletes (strava_id, access_token, refresh_token, expires_at, firstname, lastname, profile)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tokenData.athlete.id,
      tokenData.access_token,
      tokenData.refresh_token,
      expiresAt,
      tokenData.athlete.firstname,
      tokenData.athlete.lastname,
      tokenData.athlete.profile,
    ],
  );

  return (await dbGet<AthleteRow>("SELECT * FROM athletes WHERE id = ?", [
    result.lastInsertRowid,
  ])) as AthleteRow;
}

export async function seedAthleteFromEnv(): Promise<AthleteRow | null> {
  if (process.env.VERCEL) return null;

  const accessToken = process.env.STRAVA_ACCESS_TOKEN;
  if (!accessToken) return null;

  const existing = await dbGet<AthleteRow>("SELECT * FROM athletes LIMIT 1");
  if (existing) return existing;

  const res = await fetch(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const athlete = await res.json();
  return upsertAthleteFromToken({
    access_token: accessToken,
    refresh_token: process.env.STRAVA_REFRESH_TOKEN ?? "",
    expires_at: resolveExpiresAt(process.env.STRAVA_EXPIRES_AT),
    athlete: {
      id: athlete.id,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      profile: athlete.profile,
    },
  });
}

export async function fetchActivities(
  athlete: AthleteRow,
  page = 1,
  perPage = 50,
): Promise<StravaActivity[]> {
  return stravaFetch(
    athlete,
    `/athlete/activities?page=${page}&per_page=${perPage}`,
  );
}

export async function fetchActivityDetail(
  athlete: AthleteRow,
  id: number,
): Promise<StravaActivity> {
  return stravaFetch(athlete, `/activities/${id}`);
}

export async function fetchActivityStreams(
  athlete: AthleteRow,
  activityId: number,
): Promise<StravaStreams> {
  const keys = [
    "time",
    "distance",
    "latlng",
    "heartrate",
    "velocity_smooth",
    "altitude",
    "cadence",
  ].join(",");
  return stravaFetch(
    athlete,
    `/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
  );
}

export async function saveActivity(
  athleteId: number,
  activity: StravaActivity,
): Promise<void> {
  await dbRun(
    `INSERT INTO activities (
      strava_id, athlete_id, name, type, sport_type, start_date, distance, moving_time,
      elapsed_time, total_elevation_gain, average_speed, max_speed, average_heartrate,
      max_heartrate, average_cadence, summary_polyline, start_latlng, suffer_score, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(strava_id) DO UPDATE SET
      name = excluded.name, distance = excluded.distance, moving_time = excluded.moving_time,
      average_speed = excluded.average_speed, average_heartrate = excluded.average_heartrate,
      total_elevation_gain = excluded.total_elevation_gain, raw_json = excluded.raw_json`,
    [
      activity.id,
      athleteId,
      activity.name,
      activity.type,
      activity.sport_type,
      activity.start_date,
      activity.distance,
      activity.moving_time,
      activity.elapsed_time,
      activity.total_elevation_gain,
      activity.average_speed ?? null,
      activity.max_speed ?? null,
      activity.average_heartrate ?? null,
      activity.max_heartrate ?? null,
      activity.average_cadence ?? null,
      activity.map?.summary_polyline ?? null,
      activity.start_latlng ? JSON.stringify(activity.start_latlng) : null,
      activity.suffer_score ?? null,
      JSON.stringify(activity),
    ],
  );
}

export async function syncActivities(athlete: AthleteRow, maxPages = 3) {
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const activities = await fetchActivities(athlete, page);
    if (activities.length === 0) break;

    for (const activity of activities) {
      if (activity.type === "Run" || activity.sport_type === "Run") {
        await saveActivity(athlete.id, activity);
        total++;
      }
    }

    if (activities.length < 50) break;
  }

  await dbRun("UPDATE athletes SET synced_at = ? WHERE id = ?", [
    Math.floor(Date.now() / 1000),
    athlete.id,
  ]);

  return total;
}

export async function getActivitiesForAthlete(athleteId: number, limit = 50) {
  return dbAll<ActivityRow>(
    `SELECT * FROM activities WHERE athlete_id = ? AND (type = 'Run' OR sport_type = 'Run')
     ORDER BY start_date DESC LIMIT ?`,
    [athleteId, limit],
  );
}

export async function getActivityByStravaId(stravaId: number) {
  return dbGet<ActivityRow>("SELECT * FROM activities WHERE strava_id = ?", [
    stravaId,
  ]);
}

export async function getActivityForAthlete(
  stravaId: number,
  athleteId: number,
) {
  return dbGet<ActivityRow>(
    "SELECT * FROM activities WHERE strava_id = ? AND athlete_id = ?",
    [stravaId, athleteId],
  );
}

export async function saveStreams(
  stravaId: number,
  streams: StravaStreams,
): Promise<void> {
  await dbRun("UPDATE activities SET streams_json = ? WHERE strava_id = ?", [
    JSON.stringify(streams),
    stravaId,
  ]);
}

export async function saveInsights(
  stravaId: number,
  insights: unknown,
): Promise<void> {
  await dbRun("UPDATE activities SET insights_json = ? WHERE strava_id = ?", [
    JSON.stringify(insights),
    stravaId,
  ]);
}
