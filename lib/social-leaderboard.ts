import type { AnalysisProfile } from "@/lib/types";

export type SocialBoardPlatform = "pump" | "fomo";

export type SocialBoardRow = {
  id: string;
  platform: SocialBoardPlatform;
  platformRank: number;
  handle: string;
  label: string;
  avatarUrl: string | null;
  profileUrl: string;
  metricLabel: "24H REALIZED PNL" | "WALLET PERF";
  primaryMetric: number | null;
  pnl24hUsd: number | null;
  volume24hUsd: number | null;
  trades24h: number | null;
  followers: number | null;
  winRate: number | null;
  weightedReturn: number | null;
  medianHoldSeconds: number | null;
  lastActivityAt: number | null;
  sampleLabel: string;
};

type Json = Record<string, unknown>;

const finite = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const clean = (value: unknown, fallback = "Unknown") => typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
const timestamp = (value: unknown) => {
  const parsed = finite(value);
  if (parsed !== null) return new Date(parsed > 10_000_000_000 ? parsed : parsed * 1000).toISOString();
  const text = clean(value, "");
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null;
};

export function parseFomoLeaderboard(payload: unknown): SocialBoardRow[] {
  if (!payload || typeof payload !== "object") return [];
  const entries = Array.isArray((payload as Json).entries) ? (payload as Json).entries as unknown[] : [];
  return entries.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Json;
    const id = clean(row.id, "");
    const handle = clean(row.handle, "");
    if (!id || !handle) return [];
    return [{
      id: `fomo:${id}`,
      platform: "fomo" as const,
      platformRank: finite(row.rank) ?? index + 1,
      handle,
      label: clean(row.label, handle),
      avatarUrl: clean(row.avatarUrl, "") || null,
      profileUrl: `https://fomo.family/profile/${encodeURIComponent(handle)}`,
      metricLabel: "24H REALIZED PNL" as const,
      primaryMetric: finite(row.pnl),
      pnl24hUsd: finite(row.pnl),
      volume24hUsd: finite(row.volume),
      trades24h: finite(row.numTrades),
      followers: finite(row.followers),
      winRate: null,
      weightedReturn: null,
      medianHoldSeconds: null,
      lastActivityAt: null,
      sampleLabel: "Fomo / rolling 24h",
    }];
  });
}

export function pumpProfilesToBoard(profiles: AnalysisProfile[]): SocialBoardRow[] {
  const byWallet = new Map<string, AnalysisProfile>();
  for (const profile of profiles.filter((item) => item.source === "pump")) {
    const wallet = profile.wallets[0]?.address;
    if (!wallet) continue;
    const current = byWallet.get(wallet);
    if (!current || profile.updatedAt > current.updatedAt) byWallet.set(wallet, profile);
  }
  return [...byWallet.values()].sort((a, b) => (b.metrics.score ?? -1) - (a.metrics.score ?? -1)).map((profile, index) => ({
    id: `pump:${profile.id}`,
    platform: "pump",
    platformRank: index + 1,
    handle: profile.handle || profile.label,
    label: profile.label,
    avatarUrl: null,
    profileUrl: profile.handle ? `https://pump.fun/profile/${encodeURIComponent(profile.handle)}` : `https://solscan.io/account/${encodeURIComponent(profile.wallets[0].address)}`,
    metricLabel: "WALLET PERF",
    primaryMetric: profile.metrics.score,
    pnl24hUsd: null,
    volume24hUsd: null,
    trades24h: null,
    followers: null,
    winRate: profile.metrics.winRate,
    weightedReturn: profile.metrics.capitalWeightedReturn,
    medianHoldSeconds: profile.metrics.medianHoldSeconds,
    lastActivityAt: profile.metrics.lastActivityAt,
    sampleLabel: profile.dataset === "pump_daily_v1" ? `${profile.metrics.closedLots} closed positions / 90d batch` : `${profile.metrics.closedLots} verified closed lot${profile.metrics.closedLots === 1 ? "" : "s"}`,
  }));
}

export async function fetchFomoLeaderboard(): Promise<{ rows: SocialBoardRow[]; capturedAt: string | null; configured: boolean }> {
  const key = process.env.FOMOSCAN_API_KEY;
  if (!key) return { rows: [], capturedAt: null, configured: false };
  const base = (process.env.FOMOSCAN_BASE || "https://api.fomoscan.sh").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base}/v2/leaderboard/traders?window=24h`, {
      cache: "no-store", signal: controller.signal, headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    });
    if (!response.ok) throw new Error(`FomoScan leaderboard returned ${response.status}.`);
    const payload = await response.json() as Json;
    return { rows: parseFomoLeaderboard(payload), capturedAt: timestamp(payload.capturedAt), configured: true };
  } finally { clearTimeout(timer); }
}
