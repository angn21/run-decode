import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/** Vercel serverless has a read-only project dir; use /tmp there. */
function getDataDir(): string {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "run-decode");
  }
  return path.join(process.cwd(), "data");
}

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, "run-decode.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS athletes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strava_id INTEGER UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      firstname TEXT,
      lastname TEXT,
      profile TEXT,
      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS activities (
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
    );

    CREATE INDEX IF NOT EXISTS idx_activities_athlete_date
      ON activities(athlete_id, start_date DESC);
  `);
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
