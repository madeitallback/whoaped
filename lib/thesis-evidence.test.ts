import { describe, expect, it } from "vitest";
import { parseThesisCapture, thesisContentHash } from "./thesis-evidence";

const mint = "So11111111111111111111111111111111111111112";
const input = {
  mint,
  platform: "pump",
  platformProfileId: "profile-123",
  handle: "alpha",
  displayName: "Alpha Trader",
  profileUrl: "https://pump.fun/profile/alpha#bio",
  sourceUrl: "https://pump.fun/coin/abc#comments",
  sourceText: "  I like the distribution and I am holding.  ",
  publishedAt: "2026-08-25T12:00:00Z",
  relevance: "explicit",
};

describe("thesis evidence capture", () => {
  it("normalizes public attributable evidence deterministically", () => {
    const parsed = parseThesisCapture(input);
    expect(parsed.sourceText).toBe("I like the distribution and I am holding.");
    expect(parsed.sourceUrl).not.toContain("#");
    expect(thesisContentHash(parsed)).toHaveLength(64);
    expect(thesisContentHash(parsed)).toBe(thesisContentHash(parseThesisCapture(input)));
  });

  it("rejects arbitrary sources and oversized text", () => {
    expect(() => parseThesisCapture({ ...input, sourceUrl: "https://example.com/post" })).toThrow(/public Pump URL/);
    expect(() => parseThesisCapture({ ...input, sourceText: "x".repeat(4_001) })).toThrow(/4,000/);
  });

  it("does not accept a future or malformed publication time", () => {
    expect(() => parseThesisCapture({ ...input, publishedAt: "not-a-date" })).toThrow(/Published time/);
    expect(() => parseThesisCapture({ ...input, publishedAt: "2100-01-01T00:00:00Z" })).toThrow(/Published time/);
  });
});
