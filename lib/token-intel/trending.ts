export type TrendingToken = {
  rank: number;
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  priceUsd: number | null;
  priceChange24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
};

type JsonRecord = Record<string, unknown>;

function finiteNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseBirdeyeTrending(payload: unknown): TrendingToken[] {
  if (!payload || typeof payload !== "object") throw new Error("Birdeye returned an unsupported trending payload.");
  const root = payload as JsonRecord;
  const data = root.data && typeof root.data === "object" ? root.data as JsonRecord : root;
  const rows = Array.isArray(data.tokens) ? data.tokens : Array.isArray(data.items) ? data.items : [];
  const seen = new Set<string>();
  const tokens: TrendingToken[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as JsonRecord;
    const mint = typeof row.address === "string" ? row.address : typeof row.mint === "string" ? row.mint : "";
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) || seen.has(mint)) continue;
    seen.add(mint);
    tokens.push({
      rank: tokens.length + 1,
      mint,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Solana token",
      symbol: typeof row.symbol === "string" && row.symbol.trim() ? row.symbol.trim() : mint.slice(0, 5).toUpperCase(),
      imageUrl: typeof row.logoURI === "string" ? row.logoURI : typeof row.logoUri === "string" ? row.logoUri : typeof row.image === "string" ? row.image : null,
      priceUsd: finiteNumber(row.price, row.priceUsd, row.price_usd),
      priceChange24hPct: finiteNumber(row.price24hChangePercent, row.priceChange24hPercent, row.price_change_24h_percent),
      volume24hUsd: finiteNumber(row.volume24hUSD, row.volume24hUsd, row.volume_24h_usd),
      liquidityUsd: finiteNumber(row.liquidity, row.liquidityUsd, row.liquidity_usd),
    });
  }
  return tokens;
}

export async function fetchTrendingTokens(limit = 12) {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) throw new Error("BIRDEYE_API_KEY is not configured.");
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const response = await fetch(`https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=${safeLimit}`, {
    headers: { accept: "application/json", "X-API-KEY": key, "x-chain": "solana" },
    next: { revalidate: 45 },
  });
  if (!response.ok) throw new Error(`Birdeye trending request failed (${response.status}).`);
  return parseBirdeyeTrending(await response.json()).slice(0, safeLimit);
}
