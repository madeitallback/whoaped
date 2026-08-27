import { describe, expect, it } from "vitest";
import { parseFomoTokenTheses } from "./fomo-theses";

describe("FomoScan token thesis parser", () => {
  const mint = "So11111111111111111111111111111111111111112";
  it("keeps attributable theses for the requested token", () => {
    const result = parseFomoTokenTheses({ items: [{ id: "thesis-1", authorId: "user-1", authorHandle: "frank", authorName: "Frank", thesis: "I like the distribution and liquidity.", tokenAddress: mint, fomoCreatedAt: 1_780_000_000, likeCount: 4, holdingsUsd: 5000 }] }, mint);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ providerId: "thesis-1", authorId: "user-1", authorHandle: "frank", profileUrl: "https://fomo.family/profile/frank", likeCount: 4 });
    expect(result[0].contentHash).toHaveLength(64);
  });
  it("rejects mismatched and unattributable rows", () => {
    expect(parseFomoTokenTheses({ items: [{ id: "x", authorId: "u", thesis: "text", tokenAddress: "different" }, { id: "y", thesis: "missing author", tokenAddress: mint }] }, mint)).toEqual([]);
  });
});
