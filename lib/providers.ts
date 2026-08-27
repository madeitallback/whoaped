import type { NormalizedTrade } from "./types";

const HELIUS_BASE = "https://api.helius.xyz/v0";
const BIRDEYE_BASE = "https://public-api.birdeye.so/defi";
const STABLE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYDqpooRwtkY2sZL8S4pQMq", // USDT
]);
const SOL_MINT = "So11111111111111111111111111111111111111112";

type TokenAmount = { mint?: string; tokenAmount?: number | string; rawTokenAmount?: { tokenAmount?: string; decimals?: number } };
type HeliusTransaction = {
  signature?: string;
  timestamp?: number;
  type?: string;
  events?: { swap?: { nativeInput?: { amount?: number | string }; nativeOutput?: { amount?: number | string }; tokenInputs?: TokenAmount[]; tokenOutputs?: TokenAmount[] } };
};

const priceCache = new Map<string, number | null>();

function amountOf(value: TokenAmount) {
  if (typeof value.tokenAmount === "number") return value.tokenAmount;
  if (typeof value.tokenAmount === "string") return Number(value.tokenAmount);
  if (value.rawTokenAmount?.tokenAmount) return Number(value.rawTokenAmount.tokenAmount) / 10 ** Number(value.rawTokenAmount.decimals ?? 0);
  return 0;
}

function nativeAmount(amount: number | string | undefined) {
  const value = typeof amount === "string" ? Number(amount) : amount ?? 0;
  return Number.isFinite(value) ? value / 1e9 : 0;
}

export async function priceAt(token: string, timestamp: number): Promise<number | null> {
  if (STABLE_MINTS.has(token)) return 1;
  const key = `${token}:${timestamp}`;
  if (priceCache.has(key)) return priceCache.get(key) ?? null;
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(`${BIRDEYE_BASE}/historical_price_unix?address=${encodeURIComponent(token)}&unixtime=${timestamp}`, {
    headers: { "X-API-KEY": apiKey, "x-chain": "solana" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    priceCache.set(key, null);
    return null;
  }
  const body = (await response.json()) as { data?: { value?: number } };
  const value = typeof body.data?.value === "number" ? body.data.value : null;
  priceCache.set(key, value);
  return value;
}

export async function normalizeSwap(transaction: HeliusTransaction, index: number): Promise<NormalizedTrade[]> {
  const swap = transaction.events?.swap;
  const timestamp = transaction.timestamp;
  if (!swap || !timestamp || !transaction.signature) return [];
  const inputs = swap.tokenInputs ?? [];
  const outputs = swap.tokenOutputs ?? [];
  const trades: NormalizedTrade[] = [];

  // Token output means the wallet acquired the token; token input means it disposed of it.
  for (const token of outputs) {
    if (!token.mint || STABLE_MINTS.has(token.mint)) continue;
    const quantity = amountOf(token);
    if (!quantity) continue;
    const priceUsd = await priceAt(token.mint, timestamp);
    trades.push({ id: `${transaction.signature}:buy:${index}:${token.mint}`, signature: transaction.signature, timestamp, token: token.mint, symbol: token.mint.slice(0, 6), side: "buy", quantity, priceUsd, grossUsd: priceUsd === null ? null : priceUsd * quantity });
  }
  for (const token of inputs) {
    if (!token.mint || STABLE_MINTS.has(token.mint)) continue;
    const quantity = amountOf(token);
    if (!quantity) continue;
    const priceUsd = await priceAt(token.mint, timestamp);
    trades.push({ id: `${transaction.signature}:sell:${index}:${token.mint}`, signature: transaction.signature, timestamp, token: token.mint, symbol: token.mint.slice(0, 6), side: "sell", quantity, priceUsd, grossUsd: priceUsd === null ? null : priceUsd * quantity });
  }

  // Helius represents SOL as nativeInput/nativeOutput rather than a token row.
  // If the other leg is only a stablecoin, SOL is the actual asset being traded
  // and must be kept; otherwise a USDC → SOL swap looked like "no activity".
  if (!trades.length) {
    const receivedSol = nativeAmount(swap.nativeOutput?.amount);
    const spentSol = nativeAmount(swap.nativeInput?.amount);
    if (receivedSol) {
      const priceUsd = await priceAt(SOL_MINT, timestamp);
      trades.push({ id: `${transaction.signature}:buy:${index}:${SOL_MINT}`, signature: transaction.signature, timestamp, token: SOL_MINT, symbol: "SOL", side: "buy", quantity: receivedSol, priceUsd, grossUsd: priceUsd === null ? null : priceUsd * receivedSol });
    } else if (spentSol) {
      const priceUsd = await priceAt(SOL_MINT, timestamp);
      trades.push({ id: `${transaction.signature}:sell:${index}:${SOL_MINT}`, signature: transaction.signature, timestamp, token: SOL_MINT, symbol: "SOL", side: "sell", quantity: spentSol, priceUsd, grossUsd: priceUsd === null ? null : priceUsd * spentSol });
    }
  }

  // SOL-only swaps can otherwise have no token input/output representation.
  if (!inputs.length && swap.nativeInput?.amount && outputs.length) {
    const solPrice = await priceAt(SOL_MINT, timestamp);
    const solUsd = solPrice === null ? null : nativeAmount(swap.nativeInput.amount) * solPrice;
    for (const trade of trades.filter((trade) => trade.side === "buy" && trade.grossUsd === null)) {
      trade.grossUsd = solUsd;
      trade.priceUsd = solUsd === null ? null : solUsd / trade.quantity;
    }
  }
  return trades;
}

export async function fetchSolanaTrades(address: string, days = 90): Promise<NormalizedTrade[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error("HELIUS_API_KEY is not configured.");
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const transactions: HeliusTransaction[] = [];
  let before: string | undefined;

  // Bound the first backfill to 1,000 parsed transactions to protect API budgets.
  for (let page = 0; page < 10; page += 1) {
    const cursor = before ? `&before=${encodeURIComponent(before)}` : "";
    const response = await fetch(`${HELIUS_BASE}/addresses/${encodeURIComponent(address)}/transactions?api-key=${apiKey}&limit=100${cursor}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Helius request failed (${response.status}).`);
    const batch = (await response.json()) as HeliusTransaction[];
    transactions.push(...batch);
    const oldest = batch.at(-1);
    if (!batch.length || !oldest?.signature || (oldest.timestamp ?? 0) < since) break;
    before = oldest.signature;
  }
  // Helius does not consistently label all supported DEX routes as type=SWAP.
  // The parsed swap event is the reliable signal and avoids silently dropping valid trades.
  const swaps = transactions.filter((transaction) => transaction.events?.swap && (transaction.timestamp ?? 0) >= since);
  return (await Promise.all(swaps.map(normalizeSwap))).flat();
}

export function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}
