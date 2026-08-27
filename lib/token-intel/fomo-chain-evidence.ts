import type { FomoChainTrade, FomoObservedTrade } from "./fomo-holder-capture";

type TokenAmount = { mint?: string; userAccount?: string; tokenAmount?: number | string; rawTokenAmount?: { tokenAmount?: string; decimals?: number } };
type EnhancedTransaction = {
  signature?: string;
  timestamp?: number;
  events?: { swap?: { tokenInputs?: TokenAmount[]; tokenOutputs?: TokenAmount[] } };
  instructions?: unknown;
  accountData?: unknown;
  description?: string;
};

function amountOf(token: TokenAmount) {
  if (typeof token.tokenAmount === "number") return token.tokenAmount;
  if (typeof token.tokenAmount === "string") return Number(token.tokenAmount);
  const raw = token.rawTokenAmount?.tokenAmount;
  return raw ? Number(raw) / 10 ** Number(token.rawTokenAmount?.decimals ?? 0) : null;
}

export async function fetchFomoWalletTradeEvidence(wallet: string, mint: string, observed: FomoObservedTrade[]): Promise<FomoChainTrade[]> {
  const key = process.env.HELIUS_API_KEY;
  if (!key || !observed.length) return [];
  const timestamps = observed.map((trade) => Date.parse(trade.occurredAt)).filter(Number.isFinite);
  if (!timestamps.length) return [];
  const from = Math.min(...timestamps) - 5 * 60_000;
  const until = Math.max(...timestamps) + 5 * 60_000;
  const collected: EnhancedTransaction[] = [];
  let before = "";
  for (let page = 0; page < 3; page += 1) {
    const cursor = before ? `&before=${encodeURIComponent(before)}` : "";
    const response = await fetch(`https://api.helius.xyz/v0/addresses/${encodeURIComponent(wallet)}/transactions?api-key=${encodeURIComponent(key)}&limit=100${cursor}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Helius Fomo evidence request failed (${response.status}).`);
    const batch = await response.json() as EnhancedTransaction[];
    collected.push(...batch);
    const oldest = batch.at(-1);
    if (!oldest?.signature || !oldest.timestamp || oldest.timestamp * 1000 < from) break;
    before = oldest.signature;
  }
  return collected.flatMap((transaction) => {
    const occurredAtMs = Number(transaction.timestamp || 0) * 1000;
    if (!transaction.signature || occurredAtMs < from || occurredAtMs > until) return [];
    const swap = transaction.events?.swap;
    if (!swap) return [];
    const markerText = JSON.stringify({ instructions: transaction.instructions, accountData: transaction.accountData, description: transaction.description });
    const hasFomoMarker = /TradeonFomo|jitodontfront/i.test(markerText);
    const occurredAt = new Date(occurredAtMs).toISOString();
    const buys = (swap.tokenOutputs || []).filter((token) => token.mint === mint).map((token) => ({ side: "buy" as const, occurredAt, amountUi: amountOf(token), signature: transaction.signature!, hasFomoMarker }));
    const sells = (swap.tokenInputs || []).filter((token) => token.mint === mint).map((token) => ({ side: "sell" as const, occurredAt, amountUi: amountOf(token), signature: transaction.signature!, hasFomoMarker }));
    return [...buys, ...sells];
  });
}
