import { describe, expect, it } from "vitest";
import { parseBirdeyeTrending, parseDexScreenerTrending } from "./trending";

describe("Birdeye trending parser", () => {
  it("normalizes and deduplicates valid Solana tokens", () => {
    const mint = "So11111111111111111111111111111111111111112";
    expect(parseBirdeyeTrending({ data: { tokens: [
      { address: mint, name: "Wrapped SOL", symbol: "SOL", price: 123, price24hChangePercent: -2.5, volume24hUSD: 50_000, liquidity: 1_000_000 },
      { address: mint, name: "duplicate" },
      { address: "bad", name: "invalid" },
    ] } })).toEqual([{ rank: 1, mint, name: "Wrapped SOL", symbol: "SOL", imageUrl: null, priceUsd: 123, priceChange24hPct: -2.5, volume24hUsd: 50_000, liquidityUsd: 1_000_000 }]);
  });

  it("fails loudly on an unsupported payload", () => {
    expect(() => parseBirdeyeTrending(null)).toThrow(/unsupported/);
  });
});

describe("DexScreener trending parser", () => {
  it("uses Solana boost order and enriches it from the most liquid pair", () => {
    const mint = "So11111111111111111111111111111111111111112";
    const tokens = parseDexScreenerTrending([{ chainId: "solana", tokenAddress: mint, icon: "https://cdn.dexscreener.com/icon.png" }], [{ chainId: "solana", baseToken: { address: mint, name: "Wrapped SOL", symbol: "SOL" }, priceUsd: "150", priceChange: { h24: 2.5 }, volume: { h24: 3000000 }, liquidity: { usd: 4000000 }, info: { imageUrl: "https://cdn.dexscreener.com/pair.png" } }]);
    expect(tokens).toEqual([expect.objectContaining({ rank: 1, mint, symbol: "SOL", imageUrl: "https://cdn.dexscreener.com/icon.png", priceUsd: 150, liquidityUsd: 4000000 })]);
  });

  it("normalizes Dex CMS image identifiers into image URLs", () => {
    const mint = "So11111111111111111111111111111111111111112";
    const [token] = parseDexScreenerTrending([{ chainId: "solana", tokenAddress: mint, icon: "tokenImage_123" }], [{ chainId: "solana", baseToken: { address: mint, name: "Wrapped SOL", symbol: "SOL" } }]);
    expect(token.imageUrl).toBe("https://cdn.dexscreener.com/cms/images/tokenImage_123");
  });
});
