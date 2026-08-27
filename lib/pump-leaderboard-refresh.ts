import { fetchDuneWalletSummaries, type DuneWalletSummary } from "./dune";
import { fetchPumpDirectory, type PumpDirectoryProfile } from "./pump-directory";
import { listProfiles, saveProfiles } from "./store";
import type { AnalysisProfile, WalletMetrics } from "./types";

export const PUMP_DAILY_BATCH_SIZE = 20;
export const PUMP_REFRESH_TTL_MS = 20 * 60 * 60 * 1000;
let refreshInFlight: Promise<PumpRefreshResult> | null = null;
export type PumpRefreshResult = { refreshed: boolean; profiles: number; wallets: number; reason: "completed" | "fresh" | "in_flight" };

const numeric = (value: number | string | null) => { if (value === null || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function metricsFromDuneSummary(summary: DuneWalletSummary): WalletMetrics {
  const closedLots = numeric(summary.closed_positions) ?? 0;
  const winRate = numeric(summary.win_rate);
  const weightedReturn = numeric(summary.capital_weighted_return);
  const score = winRate === null || weightedReturn === null ? null : Math.round(100 * (0.6 * clamp((winRate - 0.35) / 0.35) + 0.4 * clamp((weightedReturn + 0.25) / 1.25)));
  const lastActivityAt = summary.last_activity ? Math.floor(new Date(summary.last_activity).getTime() / 1000) : null;
  return { score, closedLots, realizedPnlUsd: numeric(summary.realized_pnl_usd), capitalDeployedUsd: null, capitalWeightedReturn: weightedReturn, winRate, medianHoldSeconds: null, volumeUsd: null, lastActivityAt: Number.isFinite(lastActivityAt) ? lastActivityAt : null, active: (numeric(summary.swaps_30d) ?? 0) > 0 };
}

export function pumpSummaryProfile(directory: PumpDirectoryProfile, summary: DuneWalletSummary, updatedAt: number): AnalysisProfile {
  const metrics = metricsFromDuneSummary(summary);
  return { id: `pump-daily:${directory.wallet}`, source: "pump", label: directory.label, handle: directory.handle, wallets: [{ address: directory.wallet, chain: "solana", verified: true }], metrics, trades: [], updatedAt, status: metrics.score === null ? "partial" : "ready", notices: [`Daily Pump directory rank #${directory.rank}.`, "Wallet metrics use one cost-bounded Dune batch over the last 90 days.", "Median hold remains unavailable in the batch summary and is never inferred."] };
}

export async function hasFreshPumpDailyProfiles(now = Date.now()) {
  return (await listProfiles(100)).some((profile) => profile.id.startsWith("pump-daily:") && profile.updatedAt >= now - PUMP_REFRESH_TTL_MS);
}

async function executeRefresh(force: boolean): Promise<PumpRefreshResult> {
  if (!force && await hasFreshPumpDailyProfiles()) return { refreshed: false, profiles: 0, wallets: 0, reason: "fresh" };
  const directory = await fetchPumpDirectory(PUMP_DAILY_BATCH_SIZE);
  const summaries = await fetchDuneWalletSummaries(directory.map((profile) => profile.wallet), 90, 42_000);
  const summaryByWallet = new Map(summaries.map((summary) => [summary.address, summary]));
  const updatedAt = Date.now();
  const profiles = directory.flatMap((profile) => { const summary = summaryByWallet.get(profile.wallet); return summary ? [pumpSummaryProfile(profile, summary, updatedAt)] : []; });
  await saveProfiles(profiles);
  return { refreshed: true, profiles: profiles.length, wallets: directory.length, reason: "completed" };
}

export async function refreshPumpLeaderboard(force = false): Promise<PumpRefreshResult> {
  if (refreshInFlight) return { refreshed: false, profiles: 0, wallets: 0, reason: "in_flight" };
  refreshInFlight = executeRefresh(force).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
