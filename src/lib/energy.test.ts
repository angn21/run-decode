import { describe, expect, it } from "vitest";
import { energyKcalFromStravaRaw, KJ_PER_KCAL } from "./energy";

describe("energyKcalFromStravaRaw", () => {
  it("prefers calories when present", () => {
    expect(
      energyKcalFromStravaRaw(JSON.stringify({ calories: 420, kilojoules: 900 })),
    ).toBe(420);
  });

  it("converts kilojoules to kcal instead of treating them 1:1", () => {
    const kj = 418.4;
    expect(energyKcalFromStravaRaw(JSON.stringify({ kilojoules: kj }))).toBeCloseTo(
      kj / KJ_PER_KCAL,
      5,
    );
  });

  it("returns null when neither field is usable", () => {
    expect(energyKcalFromStravaRaw(null)).toBeNull();
    expect(energyKcalFromStravaRaw("{}")).toBeNull();
    expect(energyKcalFromStravaRaw("not-json")).toBeNull();
  });
});
