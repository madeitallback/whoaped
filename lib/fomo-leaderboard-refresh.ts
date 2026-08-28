import { createHash } from "node:crypto";
import { fetchDuneWalletSummaries } from "./dune";
import { metricsFromDuneSummary } from "./pump-leaderboard-refresh";
import { listProfiles, saveProfiles } from "./store";
import type { AnalysisProfile } from "./types";

const FOMO_METRICS_TTL_MS = 24 * 60 * 60 * 1000;

export function stableFomoProfileId(wallet: string) {
  const hex = createHash("sha256").update(`whoaped:fomo-daily:${wallet}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type VerifiedFomoWallet = { handle: string; wallet: string };

export async function refreshFomoWalletMetrics(candidates: VerifiedFomoWallet[]) {
  const unique = [...new Map(candidates.filter((item) => item.handle && item.wallet).map((item) => [item.wallet.toLowerCase(), item])).values()].slice(0, 20);
  if (!unique.length) return { refreshed: 0, skipped: 0 };
  const current = await listProfiles(500);
  const fresh = new Set(current.filter((profile) => profile.source === "fomo" && profile.updatedAt >= Date.now() - FOMO_METRICS_TTL_MS).flatMap((profile) => profile.wallets.map((wallet) => wallet.address.toLowerCase())));
  const pending = unique.filter((item) => !fresh.has(item.wallet.toLowerCase()));
  if (!pending.length) return { refreshed: 0, skipped: unique.length };
  const summaries = await fetchDuneWalletSummaries(pending.map((item) => item.wallet), 90, 120_000);
  const byWallet = new Map(summaries.map((summary) => [summary.address.toLowerCase(), summary]));
  const updatedAt = Date.now();
  const profiles: AnalysisProfile[] = pending.flatMap((item) => {
    const summary = byWallet.get(item.wallet.toLowerCase());
    if (!summary) return [];
    const metrics = metricsFromDuneSummary(summary);
    return [{
      id: stableFomoProfileId(item.wallet),
      dataset: "fomo_daily_v1",
      source: "fomo",
      label: item.handle,
      handle: item.handle,
      wallets: [{ address: item.wallet, chain: "solana", verified: true }],
      metrics,
      trades: [],
      updatedAt,
      status: metrics.winRate === null ? "partial" : "ready",
      notices: ["Wallet link was verified from a Fomo-visible token holder row using chain evidence.", "WHOAPED metrics use the same 90-day Dune methodology as the unified Pump board.", "Median hold is withheld until a verified lot-level source is available."],
    }];
  });
  await saveProfiles(profiles);
  return { refreshed: profiles.length, skipped: unique.length - pending.length };
}
