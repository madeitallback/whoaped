import { describe, expect, it } from "vitest";
import { calculateFollowerEdge, unavailableFollowerEdge } from "./follower-edge";
import type { DuneWalletSummary } from "./dune";

const wallet = (address: string, swaps: number, closed: number, winRate: number | null, weightedReturn: number | null): DuneWalletSummary => ({
  address,
  swaps_30d: swaps,
  last_activity: null,
  closed_positions: closed,
  win_rate: winRate,
  capital_weighted_return: weightedReturn,
  realized_pnl_usd: weightedReturn === null ? null : weightedReturn * 100,
});

describe("Follower Edge", () => {
  it("counts only active and scorable followers in the denominator", () => {
    const result = calculateFollowerEdge([
      wallet("profitable", 1, 4, 0.75, 0.2),
      wallet("unprofitable", 2, 8, 0.5, -0.1),
      wallet("inactive", 0, 10, 0.8, 0.5),
      wallet("insufficient", 1, 2, 1, 0.5),
    ], { visibleFollowers: 100, accessibleFollowers: 100, sampledFollowers: 4 }, 1_000);
    expect(result).toMatchObject({ platform: "pump", activeFollowers30d: 3, scorableFollowers: 2, profitableFollowers: 1, followerEdge: 0.5, calculatedAt: 1_000 });
  });

  it("uses equal-wallet medians instead of pooling trade counts", () => {
    const result = calculateFollowerEdge([
      wallet("one", 1, 3, 0.4, -0.2),
      wallet("two", 1000, 1000, 0.9, 0.8),
      wallet("three", 2, 5, 0.5, 0.1),
    ], { visibleFollowers: 3, accessibleFollowers: 3, sampledFollowers: 3 });
    expect(result.medianFollowerWinRate).toBe(0.5);
    expect(result.medianFollowerReturn).toBe(0.1);
  });

  it("returns insufficient rather than a false zero when nobody is scorable", () => {
    const result = calculateFollowerEdge([wallet("one", 1, 1, 1, 1)], { visibleFollowers: 10, accessibleFollowers: 10, sampledFollowers: 1 });
    expect(result.followerEdge).toBeNull();
    expect(result.status).toBe("insufficient");
  });

  it("keeps unavailable Pump follower data distinct from an empty population", () => {
    expect(unavailableFollowerEdge(1_094_902, 1_000)).toMatchObject({ visibleFollowers: 1_094_902, followerEdge: null, status: "unavailable", calculatedAt: 1_000 });
  });

  it("labels a user-triggered Fomo sample without presenting it as public graph coverage", () => {
    const result = calculateFollowerEdge([wallet("one", 2, 4, 0.75, 0.4)], { visibleFollowers: 100, accessibleFollowers: 8, sampledFollowers: 1 }, 1_000, { platform: "fomo", sampleStrategy: "user-triggered-visible-dom" });
    expect(result).toMatchObject({ platform: "fomo", sampleStrategy: "user-triggered-visible-dom", followerEdge: 1 });
    expect(result.notices.join(" ")).toContain("explicit Companion action");
  });
});
