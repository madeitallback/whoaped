import { calculateWalletMetrics } from "@/lib/analysis";
import { fetchDuneTrades, mergeTrades } from "@/lib/dune";
import { fetchSolanaTrades } from "@/lib/providers";
import { resolveAnalyzeInput } from "@/lib/resolver";
import type { AnalysisProfile, AnalyzeRequest, WalletInput } from "@/lib/types";

export async function analyzeProfile(input: AnalyzeRequest): Promise<AnalysisProfile> {
  const resolved = await resolveAnalyzeInput(input);
  const solanaAddress = resolved.solanaAddress;
  const wallets: WalletInput[] = [{ address: solanaAddress, chain: "solana", verified: true }];
  if (resolved.evmAddress) wallets.push({ address: resolved.evmAddress, chain: "evm", verified: true });
  const realtimeTrades = await fetchSolanaTrades(solanaAddress);
  let trades = realtimeTrades;
  let metrics = calculateWalletMetrics(trades);
  const notices = ["Solana data is live via Helius.", ...resolved.notices];
  if (process.env.DUNE_API_KEY && !metrics.closedLots) {
    try {
      const historicalTrades = await fetchDuneTrades(solanaAddress);
      trades = mergeTrades(realtimeTrades, historicalTrades);
      metrics = calculateWalletMetrics(trades);
      notices.push(`Dune historical backfill checked the last 365 days and contributed ${historicalTrades.length} swap leg${historicalTrades.length === 1 ? "" : "s"}.`);
    } catch {
      notices.push("Dune historical backfill is still queued or temporarily unavailable; this result uses Helius data and can be refreshed.");
    }
  } else if (!process.env.DUNE_API_KEY) {
    notices.push("DUNE_API_KEY is missing: historical backfill is unavailable.");
  }
  if (!process.env.BIRDEYE_API_KEY) notices.push("BIRDEYE_API_KEY is missing: USD PnL is unavailable until historical price data is configured.");
  if (resolved.evmAddress) notices.push("EVM wallet resolved and saved; EVM transaction analysis is pending a dedicated provider.");
  if (!trades.length) notices.push("No Solana swap activity was found, so no Wallet Alpha score can be calculated yet.");
  else if (!metrics.closedLots) notices.push(`${trades.length} swap leg${trades.length === 1 ? " was" : "s were"} found, but no completed buy → sell pair could be verified. A realized Wallet Alpha score needs a closed position.`);
  return {
    id: crypto.randomUUID(),
    source: resolved.source,
    label: resolved.label || resolved.handle || `${solanaAddress.slice(0, 4)}…${solanaAddress.slice(-4)}`,
    handle: resolved.handle,
    wallets,
    metrics,
    trades,
    updatedAt: Date.now(),
    status: !trades.length || trades.some((trade) => trade.grossUsd === null) ? "partial" : "ready",
    notices,
  };
}
