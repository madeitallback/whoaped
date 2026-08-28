import { fetchDuneWalletSummaries, type DuneWalletSummary } from "./dune";
import { fetchPumpDirectory, type PumpDirectoryProfile } from "./pump-directory";
import { resolvePumpProfiles } from "./platforms/pump/adapter";
import { listProfiles, saveProfiles } from "./store";
import type { AnalysisProfile, WalletMetrics } from "./types";
import { createHash } from "node:crypto";

// Pump's public profile directory exposes a bounded top-50 cohort.  One Dune
// batch covers it, so this stays one scheduled query per day rather than 50.
export const PUMP_DAILY_BATCH_SIZE = 50;
export const PUMP_REFRESH_TTL_MS = 20 * 60 * 60 * 1000;
let refreshInFlight: Promise<PumpRefreshResult> | null = null;
export type PumpRefreshResult = { refreshed: boolean; profiles: number; wallets: number; reason: "completed" | "fresh" | "in_flight" };

export function stablePumpProfileId(wallet: string) {
  const hex = createHash("sha256").update(`whoaped:pump-daily:${wallet}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const numeric = (value: number | string | null) => { if (value === null || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function metricsFromDuneSummary(summary: DuneWalletSummary): WalletMetrics {
  const closedLots = numeric(summary.closed_positions) ?? 0;
  const winRate = numeric(summary.win_rate);
  const weightedReturn = numeric(summary.capital_weighted_return);
  const sampleConfidence = clamp(closedLots / 20);
  const rawScore = winRate === null || weightedReturn === null ? null : 100 * (0.6 * clamp((winRate - 0.35) / 0.35) + 0.4 * clamp((weightedReturn + 0.25) / 1.25));
  const score = rawScore === null ? null : Math.round(50 + (rawScore - 50) * (0.25 + 0.75 * sampleConfidence));
  const lastActivityAt = summary.last_activity ? Math.floor(new Date(summary.last_activity).getTime() / 1000) : null;
  return { score, closedLots, realizedPnlUsd: numeric(summary.realized_pnl_usd), capitalDeployedUsd: null, capitalWeightedReturn: weightedReturn, winRate, medianHoldSeconds: null, volumeUsd: null, lastActivityAt: Number.isFinite(lastActivityAt) ? lastActivityAt : null, active: (numeric(summary.swaps_30d) ?? 0) > 0, sampleConfidence, profitFactor: numeric(summary.profit_factor ?? null), medianWinnerReturn: numeric(summary.median_winner_return ?? null), medianLoserReturn: numeric(summary.median_loser_return ?? null) };
}

export function pumpSummaryProfile(directory: PumpDirectoryProfile, summary: DuneWalletSummary, updatedAt: number, identity?: { visibleFollowerCount: number | null; avatarUrl?: string | null }): AnalysisProfile {
  const metrics = metricsFromDuneSummary(summary);
  return { id: stablePumpProfileId(directory.wallet), dataset: "pump_daily_v2", source: "pump", label: directory.label, handle: directory.handle, wallets: [{ address: directory.wallet, chain: "solana", verified: true }], metrics, trades: [], updatedAt, status: metrics.score === null ? "partial" : "ready", notices: [`Daily Pump directory rank #${directory.rank}.`, "Wallet metrics use one cost-bounded Dune batch over the last 90 days.", "Median hold remains unavailable in the batch summary and is never inferred."], platformProfile: { followers: identity?.visibleFollowerCount ?? null, avatarUrl: identity?.avatarUrl ?? null } };
}

export async function hasFreshPumpDailyProfiles(now = Date.now()) {
  const daily = (await listProfiles(100)).filter((profile) => profile.dataset === "pump_daily_v2" && profile.updatedAt >= now - PUMP_REFRESH_TTL_MS);
  // A previous 20-wallet batch is valid historical data, but not a complete
  // current board after the cohort was expanded to Pump's public top 50.
  return new Set(daily.flatMap((profile) => profile.wallets.filter((wallet) => wallet.verified && wallet.chain === "solana").map((wallet) => wallet.address))).size >= PUMP_DAILY_BATCH_SIZE;
}

async function executeRefresh(force: boolean): Promise<PumpRefreshResult> {
  if (!force && await hasFreshPumpDailyProfiles()) return { refreshed: false, profiles: 0, wallets: 0, reason: "fresh" };
  const directory = await fetchPumpDirectory(PUMP_DAILY_BATCH_SIZE);
  const [summaries, identities] = await Promise.all([
    fetchDuneWalletSummaries(directory.map((profile) => profile.wallet), 90, 240_000),
    resolvePumpProfiles(directory.map((profile) => profile.wallet), 4).catch(() => ({ profiles: new Map<string, never>(), checked: 0, failed: directory.length })),
  ]);
  const summaryByWallet = new Map(summaries.map((summary) => [summary.address, summary]));
  const updatedAt = Date.now();
  const profiles = directory.flatMap((profile) => { const summary = summaryByWallet.get(profile.wallet); return summary ? [pumpSummaryProfile(profile, summary, updatedAt, identities.profiles.get(profile.wallet) ?? undefined)] : []; });
  await saveProfiles(profiles);
  return { refreshed: true, profiles: profiles.length, wallets: directory.length, reason: "completed" };
}

export async function refreshPumpLeaderboard(force = false): Promise<PumpRefreshResult> {
  if (refreshInFlight) return { refreshed: false, profiles: 0, wallets: 0, reason: "in_flight" };
  refreshInFlight = executeRefresh(force).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
