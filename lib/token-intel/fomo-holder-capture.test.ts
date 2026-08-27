import { describe, expect, it } from "vitest";
import type { TokenWalletActivity } from "@/lib/data/contracts";
import { compactAmountInterval, matchFomoTradeFingerprint, resolveFomoHolderCaptures, resolveFomoHolderCapturesWithEvidence } from "./fomo-holder-capture";

const position = (wallet: string, balanceUi: number): TokenWalletActivity => ({ wallet, balanceUi, pctOfSupply: 0, firstBuyAt: null, lastBuyAt: null, lastSellAt: null, buyTxCount: 0, sellTxCount: 0, status: "holding", observedAt: "2026-08-27T00:00:00.000Z" });

describe("Fomo holder capture", () => {
  it("turns a compact displayed balance into its rounding interval", () => {
    expect(compactAmountInterval("11.3M")).toEqual({ low: 11_250_000, high: 11_350_000 });
  });

  it("links a profile only when exactly one current balance matches", () => {
    const [result] = resolveFomoHolderCaptures([{ handle: "lizzerd", amountText: "11.3M" }], [position("wallet-a", 11_300_010)]);
    expect(result.wallet).toBe("wallet-a");
    expect(result.confidence).toBe("high");
  });

  it("rejects ambiguous and overly coarse amounts", () => {
    const positions = [position("a", 11_280_000), position("b", 11_320_000), position("c", 12_100_000)];
    expect(resolveFomoHolderCaptures([{ handle: "same", amountText: "11.3M" }], positions)[0].wallet).toBeNull();
    expect(resolveFomoHolderCaptures([{ handle: "coarse", amountText: "12M" }], positions)[0].wallet).toBeNull();
  });

  it("matches repeated side/time evidence and requires a Fomo marker", () => {
    const result = matchFomoTradeFingerprint([
      { side: "buy", occurredAt: "2026-08-27T20:14:58.000Z" },
      { side: "buy", occurredAt: "2026-08-27T20:15:10.000Z" },
    ], [
      { side: "buy", occurredAt: "2026-08-27T20:14:59.000Z", signature: "a", hasFomoMarker: true },
      { side: "buy", occurredAt: "2026-08-27T20:15:08.000Z", signature: "b", hasFomoMarker: true },
    ]);
    expect(result).toMatchObject({ matched: 2, expected: 2, markerMatches: 2, signatures: ["a", "b"] });
  });

  it("resolves an ambiguous rounded balance when exactly one wallet matches the transaction fingerprint", async () => {
    const positions = [position("wallet-a", 11_280_000), position("wallet-b", 11_320_000)];
    const trades = [
      { side: "buy" as const, occurredAt: "2026-08-27T20:14:58.000Z" },
      { side: "buy" as const, occurredAt: "2026-08-27T20:15:10.000Z" },
    ];
    const [result] = await resolveFomoHolderCapturesWithEvidence([{ handle: "lizzerd", amountText: "11.3M", trades }], positions, async (wallet) => wallet === "wallet-b" ? [
      { ...trades[0], signature: "a", hasFomoMarker: true },
      { ...trades[1], signature: "b", hasFomoMarker: true },
    ] : []);
    expect(result).toMatchObject({ wallet: "wallet-b", confidence: "high", resolutionMethod: "transaction_fingerprint" });
  });
});
