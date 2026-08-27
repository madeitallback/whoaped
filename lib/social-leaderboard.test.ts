import { describe, expect, it } from "vitest";
import { parseFomoLeaderboard, pumpProfilesToBoard } from "./social-leaderboard";

describe("social leaderboard", () => {
  it("parses the official Fomo 24h board without inventing wallet metrics", () => {
    const rows = parseFomoLeaderboard({ entries: [{ rank: 2, id: "u1", handle: "frank", label: "Frank", pnl: "1250.5", volume: 9000, followers: 42, numTrades: 8 }] });
    expect(rows[0]).toMatchObject({ platform: "fomo", platformRank: 2, pnl24hUsd: 1250.5, winRate: null, metricLabel: "24H REALIZED PNL" });
  });

  it("maps verified Pump analyses to their own transparent ranking basis", () => {
    const rows = pumpProfilesToBoard([{ id: "p1", source: "pump", label: "Pump One", handle: "one", wallets: [{ address: "wallet", chain: "solana", verified: true }], metrics: { score: 72, closedLots: 5, realizedPnlUsd: 10, capitalDeployedUsd: 20, capitalWeightedReturn: .5, winRate: .6, medianHoldSeconds: 3600, volumeUsd: 30, lastActivityAt: 1, active: true }, trades: [], updatedAt: 1, status: "ready", notices: [] }]);
    expect(rows[0]).toMatchObject({ platform: "pump", primaryMetric: 72, winRate: .6, sampleLabel: "5 verified closed lots" });
  });
});
