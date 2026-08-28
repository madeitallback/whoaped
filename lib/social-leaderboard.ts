import type { AnalysisProfile } from "@/lib/types";
import { readFomoFirstPartyLeaderboard, readFomoVerifiedWalletLinks } from "./data/repository";
import { listProfiles } from "./store";

export type SocialBoardPlatform = "pump" | "fomo";

export type SocialBoardRow = {
  id: string;
  platform: SocialBoardPlatform;
  platformRank: number;
  handle: string;
  label: string;
  avatarUrl: string | null;
  profileUrl: string;
  wallet: string | null;
  metricLabel: "24H REALIZED PNL" | "WR + WEIGHTED RETURN";
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
  sampleConfidence: number | null;
  profitFactor: number | null;
};

type Json = Record<string, unknown>;
type FomoLeaderboardResult = { rows: SocialBoardRow[]; capturedAt: string | null; configured: boolean; stale: boolean; source: "first_party" | "fomoscan" | "none" };
let lastFomoLeaderboard: { value: FomoLeaderboardResult; savedAt: number } | null = null;
const FOMO_STALE_FALLBACK_MS = 15 * 60 * 1000;

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
      wallet: null,
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
      sampleConfidence: null,
      profitFactor: null,
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
    wallet: profile.wallets[0].address,
    metricLabel: "WR + WEIGHTED RETURN",
    primaryMetric: profile.metrics.score,
    pnl24hUsd: null,
    volume24hUsd: null,
    trades24h: null,
    followers: null,
    winRate: profile.metrics.winRate,
    weightedReturn: profile.metrics.capitalWeightedReturn,
    medianHoldSeconds: profile.metrics.medianHoldSeconds,
    lastActivityAt: profile.metrics.lastActivityAt,
    sampleLabel: profile.dataset === "pump_daily_v1" || profile.dataset === "pump_daily_v2" ? `${profile.metrics.closedLots} closed positions / 90d batch` : `${profile.metrics.closedLots} verified closed lot${profile.metrics.closedLots === 1 ? "" : "s"}`,
    sampleConfidence: profile.metrics.sampleConfidence ?? null,
    profitFactor: profile.metrics.profitFactor ?? null,
  }));
}

export async function fetchFomoLeaderboard(): Promise<FomoLeaderboardResult> {
  const observed = await readFomoFirstPartyLeaderboard("24h").catch(() => []);
  if (observed.length) {
    const capturedAt = observed[0].capturedAt;
    const [links, profiles] = await Promise.all([readFomoVerifiedWalletLinks().catch(() => []), listProfiles(500).catch(() => [])]);
    const walletByHandle = new Map(links.map((link) => [link.handle.toLowerCase(), link.wallet]));
    const metricsByWallet = new Map<string, AnalysisProfile>();
    for (const profile of profiles) {
      if (profile.source !== "fomo") continue;
      for (const item of profile.wallets.filter((wallet) => wallet.verified && wallet.chain === "solana")) {
        const old = metricsByWallet.get(item.address.toLowerCase());
        if (!old || old.updatedAt < profile.updatedAt) metricsByWallet.set(item.address.toLowerCase(), profile);
      }
    }
    const rows: SocialBoardRow[] = observed.map((row) => {
      const wallet = walletByHandle.get(row.handle.toLowerCase()) ?? null;
      const metrics = wallet ? metricsByWallet.get(wallet.toLowerCase())?.metrics ?? null : null;
      return {
      id: `fomo:first-party:${row.normalizedHandle}`,
      platform: "fomo",
      platformRank: row.platformRank,
      handle: row.handle,
      label: row.displayName || row.handle,
      avatarUrl: row.avatarUrl,
      profileUrl: `https://fomo.family/profile/${encodeURIComponent(row.handle)}`,
      wallet,
      metricLabel: "24H REALIZED PNL",
      primaryMetric: row.realizedPnlUsd,
      pnl24hUsd: row.realizedPnlUsd,
      volume24hUsd: row.volumeUsd,
      trades24h: row.tradeCount,
      followers: row.followerCount,
      winRate: metrics?.winRate ?? null,
      weightedReturn: metrics?.capitalWeightedReturn ?? null,
      medianHoldSeconds: metrics?.medianHoldSeconds ?? null,
      lastActivityAt: metrics?.lastActivityAt ?? null,
      sampleLabel: metrics ? `${metrics.closedLots} verified closed lots / 90d` : "Fomo first-party / rolling 24h",
      sampleConfidence: metrics?.sampleConfidence ?? null,
      profitFactor: metrics?.profitFactor ?? null,
    } satisfies SocialBoardRow;
    });
    return { rows, capturedAt, configured: true, stale: Date.parse(capturedAt) < Date.now() - 15 * 60_000, source: "first_party" };
  }
  if (process.env.FOMOSCAN_FALLBACK_ENABLED !== "true") return { rows: [], capturedAt: null, configured: true, stale: false, source: "none" };
  const key = process.env.FOMOSCAN_API_KEY;
  if (!key) return { rows: [], capturedAt: null, configured: false, stale: false, source: "none" };
  const base = (process.env.FOMOSCAN_BASE || "https://api.fomoscan.sh").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base}/v2/leaderboard/traders?window=24h`, {
      next: { revalidate: 60 }, signal: controller.signal, headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    });
    if (!response.ok) throw new Error(`FomoScan leaderboard returned ${response.status}.`);
    const payload = await response.json() as Json;
    const value = { rows: parseFomoLeaderboard(payload), capturedAt: timestamp(payload.capturedAt), configured: true, stale: false, source: "fomoscan" as const };
    if (value.rows.length) lastFomoLeaderboard = { value, savedAt: Date.now() };
    return value;
  } catch (error) {
    if (lastFomoLeaderboard && Date.now() - lastFomoLeaderboard.savedAt <= FOMO_STALE_FALLBACK_MS) return { ...lastFomoLeaderboard.value, stale: true };
    throw error;
  } finally { clearTimeout(timer); }
}
