import { isSolanaAddress } from "../../providers";
import { readStoredFomoProfile } from "../../data/repository";
import type { PlatformFollowerRecord, PlatformProfileRecord } from "../types";

const HANDLE = /^[A-Za-z0-9_.-]{1,64}$/;

export type FomoScanUser = {
  id: string;
  handle: string;
  name: string | null;
  solanaAddress: string | null;
  avatarUrl: string | null;
};

export class FomoFormatError extends Error {
  readonly code = "FOMO_FORMAT_CHANGED";
}

export function normalizeFomoHandle(value: string) {
  const handle = value.trim().replace(/^@/, "");
  if (!HANDLE.test(handle)) throw new Error("A valid Fomo handle is required.");
  return handle;
}

export function parseFomoScanUser(payload: unknown): FomoScanUser {
  if (!payload || typeof payload !== "object") throw new FomoFormatError("FomoScan returned an unsupported identity payload.");
  const raw = payload as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const handle = typeof raw.handle === "string" ? raw.handle.trim() : "";
  if (!id || id.length > 128 || !HANDLE.test(handle)) throw new FomoFormatError("FomoScan identity is missing its stable id or canonical handle.");
  const wallet = typeof raw.solanaAddress === "string" ? raw.solanaAddress.trim() : "";
  return {
    id,
    handle,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 128) : null,
    solanaAddress: isSolanaAddress(wallet) ? wallet : null,
    avatarUrl: typeof raw.profilePicture === "string" && raw.profilePicture.startsWith("https://") ? raw.profilePicture.slice(0, 2_000) : null,
  };
}

async function fetchFomoScanUser(handle: string): Promise<FomoScanUser | null> {
  const key = process.env.FOMOSCAN_API_KEY;
  if (!key) throw new Error("FOMOSCAN_API_KEY is not configured.");
  const base = (process.env.FOMOSCAN_BASE || "https://api.fomoscan.sh").replace(/\/$/, "");
  const response = await fetch(`${base}/v2/user/handle/${encodeURIComponent(normalizeFomoHandle(handle))}`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (response.status === 429) throw new Error("FomoScan is rate limited. Retry shortly.");
  if (!response.ok) throw new Error(`FomoScan returned ${response.status}.`);
  return parseFomoScanUser(await response.json());
}

/**
 * Resolves a bounded set of public Fomo leaderboard handles. The caller owns
 * persistence and controls when this runs, so provider calls are not tied to
 * visitor traffic.
 */
export async function resolveFomoProfiles(handles: string[], concurrency = 4) {
  const unique = [...new Map(handles.flatMap((value) => {
    try {
      const handle = normalizeFomoHandle(value);
      return [[handle.toLowerCase(), handle] as const];
    } catch { return []; }
  })).values()];
  const queue = [...unique];
  const profiles: FomoScanUser[] = [];
  let failed = 0;
  async function worker() {
    while (queue.length) {
      const handle = queue.shift();
      if (!handle) return;
      try {
        const user = await fetchFomoScanUser(handle);
        if (user) profiles.push(user);
      } catch { failed += 1; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker));
  return { profiles, failed };
}

export async function fetchFomoProfile(handle: string): Promise<PlatformProfileRecord | null> {
  const stored = await readStoredFomoProfile(normalizeFomoHandle(handle)).catch(() => null);
  if (stored?.primaryWallet || !process.env.FOMOSCAN_API_KEY || process.env.FOMOSCAN_FALLBACK_ENABLED === "false") return stored ?? (() => {
    const normalized = normalizeFomoHandle(handle);
    return { platform: "fomo", platformProfileId: `handle:${normalized.toLowerCase()}`, handle: normalized, displayName: normalized, profileUrl: `https://fomo.family/profile/${encodeURIComponent(normalized)}`, primaryWallet: null, visibleFollowerCount: null, avatarUrl: null };
  })();
  const user = await fetchFomoScanUser(handle);
  if (!user) return null;
  return {
    platform: "fomo",
    platformProfileId: user.id,
    handle: user.handle,
    displayName: user.name,
    profileUrl: `https://fomo.family/profile/${encodeURIComponent(user.handle)}`,
    primaryWallet: user.solanaAddress,
    visibleFollowerCount: null,
    avatarUrl: user.avatarUrl,
  };
}

export function parseVisibleFomoFollowers(payload: unknown): string[] {
  if (!Array.isArray(payload)) throw new Error("Visible Fomo followers must be an array.");
  const handles = new Map<string, string>();
  for (const value of payload.slice(0, 250)) {
    const raw = typeof value === "string" ? value : value && typeof value === "object" && typeof (value as { handle?: unknown }).handle === "string" ? (value as { handle: string }).handle : "";
    try {
      const handle = normalizeFomoHandle(raw);
      if (!handles.has(handle.toLowerCase())) handles.set(handle.toLowerCase(), handle);
    } catch { /* Ignore unrelated links in the visible modal. */ }
  }
  return [...handles.values()];
}

export async function resolveVisibleFomoFollowers(handles: string[], concurrency = 4) {
  const queue = [...handles];
  const followers: PlatformFollowerRecord[] = [];
  let failed = 0;
  async function worker() {
    while (queue.length) {
      const handle = queue.shift();
      if (!handle) return;
      try {
        const stored = await readStoredFomoProfile(handle).catch(() => null);
        if (stored) {
          followers.push({ platformFollowerId: stored.platformProfileId, handle: stored.handle, profileUrl: stored.profileUrl, verifiedWallet: stored.primaryWallet, resolutionStatus: stored.primaryWallet ? "verified" : "unresolved", followerCount: stored.visibleFollowerCount });
          continue;
        }
        if (!process.env.FOMOSCAN_API_KEY || process.env.FOMOSCAN_FALLBACK_ENABLED === "false") {
          followers.push({ platformFollowerId: `handle:${handle.toLowerCase()}`, handle, profileUrl: `https://fomo.family/profile/${encodeURIComponent(handle)}`, verifiedWallet: null, resolutionStatus: "unresolved", followerCount: null });
          continue;
        }
        const user = await fetchFomoScanUser(handle);
        if (!user) {
          followers.push({ platformFollowerId: handle.toLowerCase(), handle, profileUrl: `https://fomo.family/profile/${encodeURIComponent(handle)}`, verifiedWallet: null, resolutionStatus: "unresolved", followerCount: null });
          continue;
        }
        followers.push({ platformFollowerId: user.id, handle: user.handle, profileUrl: `https://fomo.family/profile/${encodeURIComponent(user.handle)}`, verifiedWallet: user.solanaAddress, resolutionStatus: user.solanaAddress ? "verified" : "unresolved", followerCount: null });
      } catch { failed += 1; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker));
  return { followers, failed };
}
