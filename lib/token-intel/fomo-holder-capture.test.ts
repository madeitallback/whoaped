import { describe, expect, it } from "vitest";
import type { TokenWalletActivity } from "@/lib/data/contracts";
import { compactAmountInterval, resolveFomoHolderCaptures } from "./fomo-holder-capture";

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
});
