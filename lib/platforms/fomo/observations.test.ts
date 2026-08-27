import { describe, expect, it } from "vitest";
import { parseFomoLeaderboardCapture } from "./observations";

describe("Fomo first-party observations", () => {
  it("parses and deduplicates authorized visible leaderboard rows", () => {
    const capture = parseFomoLeaderboardCapture({ sourceUrl: "https://fomo.family/leaderboard", window: "24H", rows: [
      { handle: "FrankDeGods", displayName: "Frank", platformRank: 2, realizedPnlUsd: "1250.5", avatarUrl: "https://cdn.example/frank.png" },
      { handle: "frankdegods", platformRank: 3 },
    ] });
    expect(capture.window).toBe("24h");
    expect(capture.rows).toHaveLength(1);
    expect(capture.rows[0]).toMatchObject({ normalizedHandle: "frankdegods", platformRank: 2, realizedPnlUsd: 1250.5 });
  });

  it("rejects captures from another origin", () => {
    expect(() => parseFomoLeaderboardCapture({ sourceUrl: "https://evil.example/leaderboard", rows: [{ handle: "x", platformRank: 1 }] })).toThrow(/fomo\.family/i);
  });
});
