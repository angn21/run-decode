/** 1 kcal = 4.184 kJ (thermochemical calorie). */
export const KJ_PER_KCAL = 4.184;

/**
 * Strava list payloads often omit `calories` but include `kilojoules`.
 * Convert kJ → kcal; never treat kJ as kcal 1:1.
 */
export function energyKcalFromStravaRaw(
  rawJson: string | null | undefined,
): number | null {
  if (!rawJson) return null;
  try {
    const raw = JSON.parse(rawJson) as {
      calories?: number;
      kilojoules?: number;
    };
    if (typeof raw.calories === "number" && raw.calories > 0) {
      return raw.calories;
    }
    if (typeof raw.kilojoules === "number" && raw.kilojoules > 0) {
      return raw.kilojoules / KJ_PER_KCAL;
    }
    return null;
  } catch {
    return null;
  }
}
