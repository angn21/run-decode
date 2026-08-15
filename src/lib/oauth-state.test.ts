import { describe, expect, it } from "vitest";
import { createOAuthState, oauthStateMatches } from "./oauth-state";

describe("oauthStateMatches", () => {
  it("accepts matching cookie and query values", () => {
    const state = createOAuthState();
    expect(oauthStateMatches(state, state)).toBe(true);
  });

  it("rejects a missing cookie or query param", () => {
    expect(oauthStateMatches(undefined, "abc")).toBe(false);
    expect(oauthStateMatches("abc", null)).toBe(false);
    expect(oauthStateMatches("abc", "")).toBe(false);
  });

  it("rejects a mismatched state", () => {
    expect(oauthStateMatches("one-state-value-pad", "other-state-val-pad")).toBe(
      false,
    );
  });
});
