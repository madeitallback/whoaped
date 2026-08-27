import { describe, expect, it } from "vitest";
import { parseBirdeyeTrending } from "./trending";

describe("Birdeye trending parser", () => {
  it("normalizes and deduplicates valid Solana tokens", () => {
    const mint = "So11111111111111111111111111111111111111112";
    expect(parseBirdeyeTrending({ data: { tokens: [
      { address: mint, name: "Wrapped SOL", symbol: "SOL", price: 123, price24hChangePercent: -2.5, volume24hUSD: 50_000, liquidity: 1_000_000 },
      { address: mint, name: "duplicate" },
      { address: "bad", name: "invalid" },
    ] } })).toEqual([{ rank: 1, mint, name: "Wrapped SOL", symbol: "SOL", priceUsd: 123, priceChange24hPct: -2.5, volume24hUsd: 50_000, liquidityUsd: 1_000_000 }]);
  });

  it("fails loudly on an unsupported payload", () => {
    expect(() => parseBirdeyeTrending(null)).toThrow(/unsupported/);
  });
});
