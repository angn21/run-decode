import { describe, expect, it } from "vitest";
import { classifyRun } from "./run-classify";
import type { ActivityRow } from "./db";

function run(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 1,
    strava_id: 1,
    athlete_id: 1,
    name: "Run",
    type: "Run",
    sport_type: "Run",
    start_date: "2026-08-10T00:00:00Z",
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 0,
    average_speed: 3,
    max_speed: 4,
    average_heartrate: 140,
    max_heartrate: 160,
    average_cadence: 80,
    summary_polyline: null,
    start_latlng: null,
    suffer_score: null,
    gear_id: null,
    raw_json: null,
    streams_json: null,
    insights_json: null,
    ...overrides,
  };
}

describe("classifyRun", () => {
  it("marks HR above 155 as hard", () => {
    expect(classifyRun(run({ average_heartrate: 156, average_speed: 2.5 }), 3)).toBe(
      "hard",
    );
  });

  it("marks a run more than 5% faster than the rolling average as hard", () => {
    expect(classifyRun(run({ average_heartrate: 140, average_speed: 3.2 }), 3)).toBe(
      "hard",
    );
  });

  it("marks a typical easy pace as easy", () => {
    expect(classifyRun(run({ average_heartrate: 140, average_speed: 3 }), 3)).toBe(
      "easy",
    );
  });
});
