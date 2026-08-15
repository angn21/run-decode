import { describe, expect, it } from "vitest";
import { isTenPercentMileageJump, median } from "./mileage";

describe("median", () => {
  it("returns the middle value for an odd-length list", () => {
    expect(median([40, 5, 40])).toBe(40);
  });

  it("averages the two middle values for an even-length list", () => {
    expect(median([40, 40, 40, 5])).toBe(40);
  });
});

describe("isTenPercentMileageJump", () => {
  it("does not warn when returning to normal after a recovery week", () => {
    expect(isTenPercentMileageJump(40, [40, 40, 40, 5])).toBe(false);
  });

  it("warns when this week jumps more than 10% above the recent median", () => {
    expect(isTenPercentMileageJump(40, [20, 20, 22, 21])).toBe(true);
  });

  it("does not warn when last week was zero (new or rest block)", () => {
    expect(isTenPercentMileageJump(25, [0, 0, 0, 0])).toBe(false);
  });

  it("does not warn for a steady ~10% build vs the median", () => {
    expect(isTenPercentMileageJump(22, [20, 20, 20, 20])).toBe(false);
    expect(isTenPercentMileageJump(23, [20, 20, 20, 20])).toBe(true);
  });
});
