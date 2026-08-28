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

type DexPair = {
  chainId?: unknown;
  baseToken?: { address?: unknown; name?: unknown; symbol?: unknown };
  quoteToken?: { address?: unknown };
  info?: { imageUrl?: unknown };
  priceUsd?: unknown;
  priceChange?: { h24?: unknown };
  volume?: { h24?: unknown };
  liquidity?: { usd?: unknown };
};

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

export function parseDexScreenerTrending(profiles: unknown, pairs: unknown, limit = 12): TrendingToken[] {
  if (!Array.isArray(profiles) || !Array.isArray(pairs)) throw new Error("DexScreener returned an unsupported trending payload.");
  const profileOrder = profiles
    .filter((profile): profile is JsonRecord => Boolean(profile) && typeof profile === "object")
    .filter((profile) => profile.chainId === "solana" && typeof profile.tokenAddress === "string")
    .map((profile) => ({ mint: profile.tokenAddress as string, imageUrl: typeof profile.icon === "string" ? profile.icon : null }));
  const pairByMint = new Map<string, DexPair>();
  for (const raw of pairs) {
    if (!raw || typeof raw !== "object") continue;
    const pair = raw as DexPair;
    if (pair.chainId !== "solana" || typeof pair.baseToken?.address !== "string") continue;
    const mint = pair.baseToken.address;
    const current = pairByMint.get(mint);
    if (!current || (finiteNumber(pair.liquidity?.usd) ?? 0) > (finiteNumber(current.liquidity?.usd) ?? 0)) pairByMint.set(mint, pair);
  }
  const seen = new Set<string>();
  const tokens: TrendingToken[] = [];
  for (const profile of profileOrder) {
    if (seen.has(profile.mint)) continue;
    const pair = pairByMint.get(profile.mint);
    if (!pair || typeof pair.baseToken?.name !== "string" || typeof pair.baseToken.symbol !== "string") continue;
    seen.add(profile.mint);
    tokens.push({
      rank: tokens.length + 1,
      mint: profile.mint,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      imageUrl: profile.imageUrl || (typeof pair.info?.imageUrl === "string" ? pair.info.imageUrl : null),
      priceUsd: finiteNumber(pair.priceUsd),
      priceChange24hPct: finiteNumber(pair.priceChange?.h24),
      volume24hUsd: finiteNumber(pair.volume?.h24),
      liquidityUsd: finiteNumber(pair.liquidity?.usd),
    });
    if (tokens.length >= limit) break;
  }
  return tokens;
}

export async function fetchDexScreenerTrending(limit = 12) {
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const profilesResponse = await fetch("https://api.dexscreener.com/token-boosts/top/v1", { next: { revalidate: 45 } });
  if (!profilesResponse.ok) throw new Error(`DexScreener trending request failed (${profilesResponse.status}).`);
  const profiles = (await profilesResponse.json() as unknown[]).filter((profile) => {
    if (!profile || typeof profile !== "object") return false;
    const record = profile as JsonRecord;
    return record.chainId === "solana" && typeof record.tokenAddress === "string";
  }).slice(0, 30);
  const addresses = profiles.map((profile) => (profile as JsonRecord).tokenAddress as string);
  if (!addresses.length) return [];
  const pairsResponse = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${addresses.join(",")}`, { next: { revalidate: 45 } });
  if (!pairsResponse.ok) throw new Error(`DexScreener token request failed (${pairsResponse.status}).`);
  return parseDexScreenerTrending(profiles, await pairsResponse.json(), safeLimit);
}

export async function fetchTrendingTokens(limit = 12) {
  const safeLimit = Math.max(1, Math.min(limit, 20));
  // DexScreener is keyless and returns the token art, price, liquidity and activity in two cached requests.
  // Keep Birdeye as a quality fallback for its rank-based Solana feed.
  try {
    const dexTokens = await fetchDexScreenerTrending(safeLimit);
    if (dexTokens.length) return { tokens: dexTokens, coverage: "dexscreener-solana" as const };
  } catch (error) {
    console.warn("[tokens/trending] DexScreener unavailable", { error: error instanceof Error ? error.message : String(error) });
  }
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) throw new Error("DexScreener is unavailable and BIRDEYE_API_KEY is not configured.");
  const response = await fetch(`https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=${safeLimit}`, {
    headers: { accept: "application/json", "X-API-KEY": key, "x-chain": "solana" },
    next: { revalidate: 45 },
  });
  if (!response.ok) throw new Error(`Birdeye trending request failed (${response.status}).`);
  return { tokens: parseBirdeyeTrending(await response.json()).slice(0, safeLimit), coverage: "birdeye-solana" as const };
}
