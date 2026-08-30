import { describe, expect, it } from "vitest";
import { parseFomoLeaderboard, pumpProfilesToBoard, sortLeaderboardRows } from "./social-leaderboard";

describe("social leaderboard", () => {
  it("parses the official Fomo 24h board without inventing wallet metrics", () => {
    const rows = parseFomoLeaderboard({ entries: [{ rank: 2, id: "u1", handle: "frank", label: "Frank", pnl: "1250.5", volume: 9000, followers: 42, numTrades: 8 }] });
    expect(rows[0]).toMatchObject({ platform: "fomo", platformRank: 2, pnl24hUsd: 1250.5, winRate: null, metricLabel: "24H REALIZED PNL" });
  });

  it("uses the handle when a captured Fomo display name is only a rank artefact", () => {
    const rows = parseFomoLeaderboard({ entries: [{ rank: 4, id: "u1", handle: "trader", label: "4.", pnl: "20" }] });
    expect(rows[0]?.label).toBe("trader");
  });

  it("keeps only Pump analyses with a reliable sample and orders them by realized PnL", () => {
    const rows = pumpProfilesToBoard([{ id: "p1", source: "pump", label: "Pump One", handle: "one", wallets: [{ address: "wallet", chain: "solana", verified: true }], metrics: { score: 72, closedLots: 10, realizedPnlUsd: 10, capitalDeployedUsd: 20, capitalWeightedReturn: .5, winRate: .6, medianHoldSeconds: 3600, volumeUsd: 30, lastActivityAt: 1, active: true }, trades: [], updatedAt: 1, status: "ready", notices: [] }]);
    expect(rows[0]).toMatchObject({ platform: "pump", primaryMetric: 72, winRate: .6, sampleLabel: "10 verified closed lots" });
  });

  it("sorts displayed rows by realized PnL and keeps unknown values last", () => {
    const rows = sortLeaderboardRows([
      { id: "none", platform: "pump", platformRank: 1, handle: "none", label: "None", avatarUrl: null, profileUrl: "#", wallet: null, metricLabel: "WR + WEIGHTED RETURN", primaryMetric: null, realizedPnlUsd: null, pnl24hUsd: null, volume24hUsd: null, trades24h: null, followers: null, winRate: null, weightedReturn: null, medianHoldSeconds: null, lastActivityAt: null, sampleLabel: "", sampleConfidence: null, profitFactor: null, medianWinnerReturn: null, medianLoserReturn: null },
      { id: "top", platform: "pump", platformRank: 2, handle: "top", label: "Top", avatarUrl: null, profileUrl: "#", wallet: null, metricLabel: "WR + WEIGHTED RETURN", primaryMetric: null, realizedPnlUsd: 100, pnl24hUsd: null, volume24hUsd: null, trades24h: null, followers: null, winRate: null, weightedReturn: null, medianHoldSeconds: null, lastActivityAt: null, sampleLabel: "", sampleConfidence: null, profitFactor: null, medianWinnerReturn: null, medianLoserReturn: null },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["top", "none"]);
  });
});
