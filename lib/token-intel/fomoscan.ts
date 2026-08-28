import type { FomoIdentity } from "./types";

export function parseFomoScanProfile(body: unknown): FomoIdentity | null {
  if (!body || typeof body !== "object") return null;
  const wrapped = (body as { data?: unknown }).data;
  const source = wrapped && typeof wrapped === "object" ? wrapped as Record<string, unknown> : body as Record<string, unknown>;
  const identities = Array.isArray(source.identities) ? source.identities : [];
  const nested = source.identity && typeof source.identity === "object" ? source.identity as Record<string, unknown> : identities[0] as Record<string, unknown> | undefined;
  const handle = typeof source.handle === "string" ? source.handle : typeof nested?.handle === "string" ? nested.handle : null;
  const identityId = typeof source.id === "string" ? source.id : typeof nested?.id === "string" ? nested.id : null;
  const profilePicture = typeof source.profilePicture === "string" ? source.profilePicture : typeof nested?.profilePicture === "string" ? nested.profilePicture : null;
  return handle || identityId ? { handle, identityId, ...(profilePicture ? { avatarUrl: profilePicture } : {}), source: "fomoscan" } : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
}

async function resolveOne(wallet: string): Promise<FomoIdentity | null> {
  const key = process.env.FOMOSCAN_API_KEY;
  if (!key) return null;
  const base = (process.env.FOMOSCAN_BASE || "https://api.fomoscan.sh").replace(/\/$/, "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchWithTimeout(`${base}/v2/user/wallet/${encodeURIComponent(wallet)}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
    if (response.status === 404) return null;
    if (response.status !== 429) {
      if (!response.ok) throw new Error(`FomoScan returned ${response.status}`);
      return parseFomoScanProfile(await response.json());
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw new Error("FomoScan rate limit persisted after retries");
}

export async function resolveFomoWallets(wallets: string[]) {
  const identities = new Map<string, FomoIdentity>();
  const failures: string[] = [];
  const unique = [...new Set(wallets)].slice(0, 100);
  for (let index = 0; index < unique.length; index += 4) {
    const group = unique.slice(index, index + 4);
    const settled = await Promise.allSettled(group.map((wallet) => resolveOne(wallet)));
    settled.forEach((result, position) => {
      if (result.status === "fulfilled" && result.value) identities.set(group[position], result.value);
      if (result.status === "rejected") failures.push(group[position]);
    });
  }
  return { identities, checked: unique.length - failures.length, failed: failures.length };
}
