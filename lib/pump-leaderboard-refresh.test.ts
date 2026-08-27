import { describe, expect, it } from "vitest";
import { metricsFromDuneSummary, pumpSummaryProfile, stablePumpProfileId } from "./pump-leaderboard-refresh";
import { parsePumpDirectory } from "./pump-directory";

const wallet = "5WnAczezsDku4YkJEKW9PUzLm87Wuq6VKczLn8n2YHP2";

describe("daily Pump leaderboard refresh", () => {
  it("parses unique public Pump directory profiles", () => {
    const row = `["$","li","${wallet}",{"aria-label":"Open oxr","href":"/profile/oxr"`;
    expect(parsePumpDirectory(`${row}${row}`, 20)).toEqual([{ rank: 1, wallet, label: "oxr", handle: "oxr", profileUrl: "https://pump.fun/profile/oxr" }]);
  });

  it("keeps missing batch metrics null and calculates the transparent score", () => {
    const metrics = metricsFromDuneSummary({ address: wallet, swaps_30d: 12, last_activity: "2026-08-27T12:00:00Z", closed_positions: 10, win_rate: .7, capital_weighted_return: .4, realized_pnl_usd: 400 });
    expect(metrics).toMatchObject({ score: 81, winRate: .7, capitalWeightedReturn: .4, medianHoldSeconds: null, active: true });
  });

  it("creates a stable daily profile without fabricated trades", () => {
    const profile = pumpSummaryProfile({ rank: 1, wallet, label: "oxr", handle: "oxr", profileUrl: "https://pump.fun/profile/oxr" }, { address: wallet, swaps_30d: 0, last_activity: null, closed_positions: 0, win_rate: null, capital_weighted_return: null, realized_pnl_usd: null }, 123);
    expect(profile).toMatchObject({ id: stablePumpProfileId(wallet), dataset: "pump_daily_v1", source: "pump", status: "partial", updatedAt: 123, trades: [] });
    expect(profile.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(profile.metrics.realizedPnlUsd).toBeNull();
  });
});
