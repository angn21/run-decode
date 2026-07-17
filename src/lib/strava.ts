import { dbAll, dbGet, dbRun, type ActivityRow, type AthleteRow, type GearRow } from "./db";

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
  gear_id?: string | null;
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
      client_id: process.env.STRAVA_CLIENT_ID?.trim(),
      client_secret: process.env.STRAVA_CLIENT_SECRET?.trim(),
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

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("OAuth token exchange failed: missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
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

  await dbRun(
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

  const inserted = await dbGet<AthleteRow>(
    "SELECT * FROM athletes WHERE strava_id = ?",
    [tokenData.athlete.id],
  );
  if (!inserted) {
    throw new Error("Failed to save athlete after OAuth");
  }
  return inserted;
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

export type StravaHrZoneRange = { min: number; max: number };

/** Athlete HR zones from Strava (requires profile:read_all). */
export async function fetchAthleteHrZones(
  athlete: AthleteRow,
): Promise<StravaHrZoneRange[] | null> {
  try {
    const data = await stravaFetch<{
      heart_rate?: {
        custom_zones?: boolean;
        zones?: StravaHrZoneRange[];
      };
    }>(athlete, "/athlete/zones");
    const zones = data.heart_rate?.zones;
    if (!zones || zones.length === 0) return null;
    return zones;
  } catch (e) {
    console.error("fetchAthleteHrZones failed:", e);
    return null;
  }
}

export async function saveActivity(
  athleteId: number,
  activity: StravaActivity,
): Promise<void> {
  const gearId = activity.gear_id ?? null;
  await dbRun(
    `INSERT INTO activities (
      strava_id, athlete_id, name, type, sport_type, start_date, distance, moving_time,
      elapsed_time, total_elevation_gain, average_speed, max_speed, average_heartrate,
      max_heartrate, average_cadence, summary_polyline, start_latlng, suffer_score, gear_id, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(strava_id) DO UPDATE SET
      name = excluded.name, distance = excluded.distance, moving_time = excluded.moving_time,
      average_speed = excluded.average_speed, average_heartrate = excluded.average_heartrate,
      total_elevation_gain = excluded.total_elevation_gain, suffer_score = excluded.suffer_score,
      gear_id = COALESCE(excluded.gear_id, activities.gear_id),
      summary_polyline = excluded.summary_polyline,
      raw_json = excluded.raw_json`,
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
      gearId,
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

  await syncAthleteGears(athlete);
  return total;
}

export async function getLatestActivityForAthlete(athleteId: number) {
  return dbGet<ActivityRow>(
    `SELECT * FROM activities
     WHERE athlete_id = ? AND (type = 'Run' OR sport_type = 'Run')
     ORDER BY start_date DESC LIMIT 1`,
    [athleteId],
  );
}

/** Newest Run from Strava (list is newest-first). */
export async function fetchLatestStravaRun(
  athlete: AthleteRow,
): Promise<StravaActivity | null> {
  const activities = await fetchActivities(athlete, 1, 30);
  return (
    activities.find((a) => a.type === "Run" || a.sport_type === "Run") ?? null
  );
}

export async function touchAthleteSynced(athleteId: number): Promise<void> {
  await dbRun("UPDATE athletes SET synced_at = ? WHERE id = ?", [
    Math.floor(Date.now() / 1000),
    athleteId,
  ]);
}

/**
 * Pull newer runs from Strava until we hit the DB's previous latest (or max pages).
 * Returns Strava IDs that were not in the DB before this sync.
 */
export async function syncNewActivities(
  athlete: AthleteRow,
  maxPages = 3,
): Promise<{ synced: number; newStravaIds: number[] }> {
  const latest = await getLatestActivityForAthlete(athlete.id);
  const latestStravaId = latest?.strava_id ?? null;
  const newStravaIds: number[] = [];
  let synced = 0;
  let hitKnownLatest = false;

  for (let page = 1; page <= maxPages; page++) {
    const activities = await fetchActivities(athlete, page);
    if (activities.length === 0) break;

    for (const activity of activities) {
      if (!(activity.type === "Run" || activity.sport_type === "Run")) {
        continue;
      }

      if (latestStravaId != null && activity.id === latestStravaId) {
        hitKnownLatest = true;
        break;
      }

      const existing = await getActivityForAthlete(activity.id, athlete.id);
      await saveActivity(athlete.id, activity);
      if (!existing) {
        newStravaIds.push(activity.id);
        synced++;
      }
    }

    if (hitKnownLatest || activities.length < 50) break;
  }

  await touchAthleteSynced(athlete.id);
  await syncAthleteGears(athlete);
  return { synced, newStravaIds };
}

export type StravaGear = {
  id: string;
  name?: string;
  distance?: number;
  brand_name?: string;
  model_name?: string;
  retired?: boolean;
};

export async function fetchGear(
  athlete: AthleteRow,
  gearId: string,
): Promise<StravaGear> {
  return stravaFetch(athlete, `/gear/${gearId}`);
}

export async function upsertGear(
  athleteId: number,
  gear: StravaGear,
): Promise<void> {
  await dbRun(
    `INSERT INTO gears (
      athlete_id, strava_gear_id, name, distance_m, brand_name, model_name, retired, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(athlete_id, strava_gear_id) DO UPDATE SET
      name = excluded.name,
      distance_m = excluded.distance_m,
      brand_name = excluded.brand_name,
      model_name = excluded.model_name,
      retired = excluded.retired,
      updated_at = excluded.updated_at`,
    [
      athleteId,
      gear.id,
      gear.name ?? null,
      gear.distance ?? 0,
      gear.brand_name ?? null,
      gear.model_name ?? null,
      gear.retired ? 1 : 0,
      Math.floor(Date.now() / 1000),
    ],
  );
}

/** Pull gear_id from stored raw_json into the column (legacy rows synced before gear_id). */
export async function backfillGearIdsFromRawJson(
  athleteId: number,
): Promise<number> {
  const rows = await dbAll<{ strava_id: number; raw_json: string | null }>(
    `SELECT strava_id, raw_json FROM activities
     WHERE athlete_id = ?
       AND (gear_id IS NULL OR gear_id = '')
       AND raw_json IS NOT NULL AND raw_json != ''`,
    [athleteId],
  );
  let n = 0;
  for (const row of rows) {
    try {
      const raw = JSON.parse(row.raw_json!) as { gear_id?: string | null };
      if (raw.gear_id) {
        await dbRun("UPDATE activities SET gear_id = ? WHERE strava_id = ?", [
          raw.gear_id,
          row.strava_id,
        ]);
        n++;
      }
    } catch {
      /* ignore bad json */
    }
  }
  return n;
}

/** Fetch Strava gear for distinct gear_ids on this athlete's activities. */
export async function syncAthleteGears(athlete: AthleteRow): Promise<number> {
  await backfillGearIdsFromRawJson(athlete.id);
  const rows = await dbAll<{ gear_id: string }>(
    `SELECT DISTINCT gear_id FROM activities
     WHERE athlete_id = ? AND gear_id IS NOT NULL AND gear_id != ''`,
    [athlete.id],
  );
  let n = 0;
  for (const row of rows) {
    try {
      const gear = await fetchGear(athlete, row.gear_id);
      await upsertGear(athlete.id, gear);
      n++;
    } catch (e) {
      console.error(`syncAthleteGears failed for ${row.gear_id}:`, e);
    }
  }
  return n;
}

export async function getGearsForAthlete(athleteId: number): Promise<GearRow[]> {
  return dbAll<GearRow>(
    `SELECT * FROM gears WHERE athlete_id = ? ORDER BY retired ASC, distance_m DESC`,
    [athleteId],
  );
}

export async function getGearByStravaId(
  athleteId: number,
  stravaGearId: string,
): Promise<GearRow | undefined> {
  return dbGet<GearRow>(
    `SELECT * FROM gears WHERE athlete_id = ? AND strava_gear_id = ?`,
    [athleteId, stravaGearId],
  );
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
