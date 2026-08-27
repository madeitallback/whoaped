import { isSolanaAddress } from "../../providers";
import type { PlatformFollowerPage, PlatformFollowerRecord, PlatformProfileRecord } from "../types";

const PUMP_FOLLOWERS_API = "https://frontend-api-v3.pump.fun/following/followers";
const PUMP_FOLLOWER_COUNT_API = "https://frontend-api-v3.pump.fun/following/v3/followers/count";
const PUMP_USERS_API = "https://frontend-api-v3.pump.fun/users";
const HANDLE = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_PAGE_SIZE = 1_000;

type PumpFollowerPayload = {
  username?: unknown;
  address?: unknown;
  followers?: unknown;
};

export class PumpFormatError extends Error {
  readonly code = "PUMP_FORMAT_CHANGED";
}

type PumpProfilePayload = {
  address?: unknown;
  userId?: unknown;
  username?: unknown;
  displayName?: unknown;
  followers?: unknown;
  profileImage?: unknown;
  profileImageUrl?: unknown;
  profile_image?: unknown;
  avatarUrl?: unknown;
};

function safeImageUrl(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol === "https:") return parsed.toString();
    } catch {}
  }
  return null;
}

export function parsePumpProfile(payload: unknown, expectedWallet: string): PlatformProfileRecord {
  if (!payload || typeof payload !== "object") throw new PumpFormatError("Pump returned an unsupported profile payload.");
  const raw = payload as PumpProfilePayload;
  const address = typeof raw.address === "string" ? raw.address.trim() : "";
  const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  if (address !== expectedWallet || !isSolanaAddress(address) || !userId || userId.length > 128) {
    throw new PumpFormatError("Pump profile identity did not match the requested wallet.");
  }
  const handle = typeof raw.username === "string" && HANDLE.test(raw.username.trim()) ? raw.username.trim() : null;
  const displayName = typeof raw.displayName === "string" && raw.displayName.trim() ? raw.displayName.trim().slice(0, 128) : null;
  const visibleFollowerCount = typeof raw.followers === "number" && Number.isFinite(raw.followers) && raw.followers >= 0 ? Math.floor(raw.followers) : null;
  return {
    platform: "pump",
    platformProfileId: userId,
    handle,
    displayName,
    profileUrl: `https://pump.fun/profile/${encodeURIComponent(handle || address)}`,
    primaryWallet: address,
    visibleFollowerCount,
    avatarUrl: safeImageUrl(raw.profileImageUrl, raw.profileImage, raw.profile_image, raw.avatarUrl),
  };
}

export async function fetchPumpProfile(wallet: string): Promise<PlatformProfileRecord | null> {
  const address = wallet.trim();
  if (!isSolanaAddress(address)) throw new Error("A valid Pump profile wallet is required.");
  const response = await fetch(`${PUMP_USERS_API}/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json", "User-Agent": "WHOAPED/0.1 (public Pump identity resolver)" },
    next: { revalidate: 300 },
  });
  if (response.status === 404) return null;
  if (response.status === 429) throw new Error("Pump profile data is rate limited.");
  if (!response.ok) throw new Error(`Pump profile request failed (${response.status}).`);
  return parsePumpProfile(await response.json(), address);
}

export async function resolvePumpProfiles(wallets: string[], concurrency = 6) {
  const queue = [...new Set(wallets.filter(isSolanaAddress))];
  const profiles = new Map<string, PlatformProfileRecord>();
  let checked = 0;
  let failed = 0;
  async function worker() {
    while (queue.length) {
      const wallet = queue.shift();
      if (!wallet) return;
      try {
        const profile = await fetchPumpProfile(wallet);
        checked += 1;
        if (profile) profiles.set(wallet, profile);
      } catch {
        checked += 1;
        failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, 8, queue.length || 1)) }, worker));
  return { profiles, checked, failed };
}

export function parsePumpFollowers(payload: unknown): PlatformFollowerRecord[] | null {
  if (payload === null) return null;
  if (!Array.isArray(payload)) throw new PumpFormatError("Pump returned an unsupported follower payload.");

  const followers = new Map<string, PlatformFollowerRecord>();
  for (const raw of payload as PumpFollowerPayload[]) {
    const address = typeof raw?.address === "string" ? raw.address.trim() : "";
    if (!isSolanaAddress(address)) continue;
    const username = typeof raw.username === "string" && HANDLE.test(raw.username.trim()) ? raw.username.trim() : null;
    const followerCount = typeof raw.followers === "number" && Number.isFinite(raw.followers) && raw.followers >= 0
      ? Math.floor(raw.followers)
      : null;
    followers.set(address, {
      platformFollowerId: address,
      handle: username,
      profileUrl: username ? `https://pump.fun/profile/${encodeURIComponent(username)}` : `https://pump.fun/profile/${address}`,
      verifiedWallet: address,
      resolutionStatus: "verified",
      followerCount,
    });
  }
  return [...followers.values()];
}

export async function fetchPumpFollowers(address: string, offset = 0, limit = MAX_PAGE_SIZE): Promise<PlatformFollowerPage> {
  const wallet = address.trim();
  if (!isSolanaAddress(wallet)) throw new Error("A valid Pump profile wallet is required.");
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit)));
  const response = await fetch(`${PUMP_FOLLOWERS_API}/${encodeURIComponent(wallet)}?offset=${safeOffset}&limit=${safeLimit}`, {
    headers: { Accept: "application/json", "User-Agent": "WHOAPED/0.1 (public Pump follower analytics)" },
    cache: "no-store",
  });
  if (response.status === 429) throw new Error("Pump follower data is rate limited. Keep the cached result and retry later.");
  if (!response.ok) throw new Error(`Pump follower request failed (${response.status}).`);
  const followers = parsePumpFollowers(await response.json());
  if (followers === null) return { followers: [], nextOffset: null, source: "public-api", status: "unavailable" };
  return {
    followers,
    nextOffset: followers.length === safeLimit ? safeOffset + safeLimit : null,
    source: "public-api",
    status: "ready",
  };
}

export async function fetchPumpFollowerCount(address: string): Promise<number> {
  const wallet = address.trim();
  if (!isSolanaAddress(wallet)) throw new Error("A valid Pump profile wallet is required.");
  const response = await fetch(`${PUMP_FOLLOWER_COUNT_API}/${encodeURIComponent(wallet)}`, {
    headers: { Accept: "application/json", "User-Agent": "WHOAPED/0.1 (public Pump follower analytics)" },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Pump follower count request failed (${response.status}).`);
  const payload = (await response.json()) as { count?: unknown };
  if (typeof payload.count !== "number" || !Number.isFinite(payload.count) || payload.count < 0) {
    throw new PumpFormatError("Pump returned an unsupported follower count payload.");
  }
  return Math.floor(payload.count);
}

export function stratifiedFollowerOffsets(totalFollowers: number, sampleSize: number, strata = 4) {
  const accessibleFollowers = Math.min(Math.max(0, Math.floor(totalFollowers)), 10_001);
  const safeSampleSize = Math.max(1, Math.min(accessibleFollowers || 1, Math.floor(sampleSize)));
  const safeStrata = Math.max(1, Math.min(strata, safeSampleSize));
  const perStratum = Math.ceil(safeSampleSize / safeStrata);
  if (accessibleFollowers <= perStratum) return [{ offset: 0, limit: accessibleFollowers }];
  return Array.from({ length: safeStrata }, (_, index) => ({
    offset: safeStrata === 1 ? 0 : Math.floor(index * (accessibleFollowers - perStratum) / (safeStrata - 1)),
    limit: Math.min(perStratum, safeSampleSize - index * perStratum),
  })).filter((page) => page.limit > 0);
}

export async function samplePumpFollowers(address: string, sampleSize = 20) {
  const visibleFollowerCount = await fetchPumpFollowerCount(address);
  if (!visibleFollowerCount) return { followers: [], visibleFollowerCount, accessibleFollowerCount: 0, status: "ready" as const };
  const pages = await Promise.all(stratifiedFollowerOffsets(visibleFollowerCount, sampleSize).map(({ offset, limit }) => fetchPumpFollowers(address, offset, limit)));
  if (pages.some((page) => page.status === "unavailable")) {
    return { followers: [], visibleFollowerCount, accessibleFollowerCount: 0, status: "unavailable" as const };
  }
  const unique = new Map(pages.flatMap((page) => page.followers).map((follower) => [follower.platformFollowerId, follower]));
  return {
    followers: [...unique.values()].slice(0, sampleSize),
    visibleFollowerCount,
    accessibleFollowerCount: Math.min(visibleFollowerCount, 10_001),
    status: "ready" as const,
  };
}
