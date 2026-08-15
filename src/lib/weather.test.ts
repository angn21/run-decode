import { describe, expect, it } from "vitest";
import { archiveRequestForRun } from "./weather";

describe("archiveRequestForRun", () => {
  it("uses the local calendar date and hour, not UTC", () => {
    // 23:00 UTC on 14 Aug = 06:00 on 15 Aug in Asia/Bangkok (UTC+7)
    const q = archiveRequestForRun("2026-08-14T23:00:00Z", "Asia/Bangkok");
    expect(q.date).toBe("2026-08-15");
    expect(q.hour).toBe(6);
  });

  it("keeps UTC date and hour when the zone is UTC", () => {
    const q = archiveRequestForRun("2026-08-14T23:00:00Z", "UTC");
    expect(q.date).toBe("2026-08-14");
    expect(q.hour).toBe(23);
  });
});
