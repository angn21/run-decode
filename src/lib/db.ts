import { createClient, type Client, type InValue } from "@libsql/client";
import fs from "fs";
import path from "path";

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function getDbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return `file:${path.join(dataDir, "run-decode.db")}`;
}

export function getDb(): Client {
  if (!client) {
    client = createClient({
      url: getDbUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    schemaReady = initSchema(client);
  }
  return client;
}

async function ensureSchema(): Promise<void> {
  getDb();
  await schemaReady;
}

async function initSchema(database: Client): Promise<void> {
  await database.batch([
    `CREATE TABLE IF NOT EXISTS athletes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strava_id INTEGER UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      firstname TEXT,
      lastname TEXT,
      profile TEXT,
      synced_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strava_id INTEGER UNIQUE NOT NULL,
      athlete_id INTEGER NOT NULL,
      name TEXT,
      type TEXT,
      sport_type TEXT,
      start_date TEXT NOT NULL,
      distance REAL DEFAULT 0,
      moving_time INTEGER DEFAULT 0,
      elapsed_time INTEGER DEFAULT 0,
      total_elevation_gain REAL DEFAULT 0,
      average_speed REAL,
      max_speed REAL,
      average_heartrate REAL,
      max_heartrate REAL,
      average_cadence REAL,
      summary_polyline TEXT,
      start_latlng TEXT,
      suffer_score REAL,
      raw_json TEXT,
      streams_json TEXT,
      insights_json TEXT,
      FOREIGN KEY (athlete_id) REFERENCES athletes(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_activities_athlete_date
      ON activities(athlete_id, start_date DESC)`,
  ]);
}

function rowToRecord<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

export async function dbGet<T>(
  sql: string,
  args: InValue[] = [],
): Promise<T | undefined> {
  await ensureSchema();
  const result = await getDb().execute({ sql, args });
  if (result.rows.length === 0) return undefined;
  return rowToRecord<T>(result.rows[0] as unknown as Record<string, unknown>);
}

export async function dbAll<T>(
  sql: string,
  args: InValue[] = [],
): Promise<T[]> {
  await ensureSchema();
  const result = await getDb().execute({ sql, args });
  return result.rows.map((row) =>
    rowToRecord<T>(row as unknown as Record<string, unknown>),
  );
}

export async function dbRun(
  sql: string,
  args: InValue[] = [],
): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  await ensureSchema();
  const result = await getDb().execute({ sql, args });
  return {
    lastInsertRowid: Number(result.lastInsertRowid),
    rowsAffected: result.rowsAffected,
  };
}

export type AthleteRow = {
  id: number;
  strava_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  firstname: string | null;
  lastname: string | null;
  profile: string | null;
  synced_at: number | null;
};

export type ActivityRow = {
  id: number;
  strava_id: number;
  athlete_id: number;
  name: string | null;
  type: string | null;
  sport_type: string | null;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number | null;
  max_speed: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  summary_polyline: string | null;
  start_latlng: string | null;
  suffer_score: number | null;
  raw_json: string | null;
  streams_json: string | null;
  insights_json: string | null;
};
