import { describe, expect, it } from "vitest";
import type { TokenSocialActor, TokenWalletActivity } from "@/lib/data/contracts";
import { mergeTokenHolders } from "./unified-holders";

const position = (wallet: string, balanceUi: number): TokenWalletActivity => ({ wallet, balanceUi, pctOfSupply: balanceUi / 1000, firstBuyAt: null, lastBuyAt: null, lastSellAt: null, buyTxCount: 0, sellTxCount: 0, status: "holding", observedAt: "2026-08-27T00:00:00.000Z" });
const actor = (platform: "pump" | "fomo", wallet: string): TokenSocialActor => ({ profileId: `${platform}-id`, platform, platformProfileId: `${platform}-profile`, handle: platform, displayName: platform, profileUrl: `https://${platform}.example/profile`, wallet, relationship: "holder", confidence: "verified", observedAt: "2026-08-27T00:00:00.000Z" });

describe("mergeTokenHolders", () => {
  it("keeps one position row and attaches both platform profiles", () => {
    const rows = mergeTokenHolders([position("wallet", 42)], [actor("pump", "wallet"), actor("fomo", "wallet")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].profiles.map((profile) => profile.platform)).toEqual(["fomo", "pump"]);
  });

  it("keeps unidentified holders and excludes exited wallets", () => {
    const rows = mergeTokenHolders([position("holder", 10), position("exited", 0)], []);
    expect(rows.map((row) => row.wallet)).toEqual(["holder"]);
    expect(rows[0].profiles).toEqual([]);
  });
});
