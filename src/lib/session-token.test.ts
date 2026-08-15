import { describe, expect, it } from "vitest";
import { signAthleteId, verifyAthleteSession } from "./session-token";

const SECRET = "test-session-secret";

describe("verifyAthleteSession", () => {
  it("round-trips a signed athlete id", () => {
    const token = signAthleteId(7, SECRET);
    expect(verifyAthleteSession(token, SECRET)).toBe(7);
  });

  it("rejects an unsigned numeric cookie", () => {
    expect(verifyAthleteSession("1", SECRET)).toBeNull();
  });

  it("rejects a tampered athlete id", () => {
    const token = signAthleteId(1, SECRET);
    const tampered = token.replace(/^1\./, "2.");
    expect(verifyAthleteSession(tampered, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signAthleteId(3, SECRET);
    expect(verifyAthleteSession(token, "other-secret")).toBeNull();
  });

  it("rejects missing values", () => {
    expect(verifyAthleteSession(undefined, SECRET)).toBeNull();
    expect(verifyAthleteSession("1.abc", "")).toBeNull();
  });
});
