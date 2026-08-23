export type FomoHit = { handle: string | null; confidence: number | null; identityId: string | null };
const memory = new Map<string, { value: FomoHit | null; expires: number }>();

async function timedFetch(url: string, init: RequestInit, ms = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timeout); }
}

export function parseFomoScanProfile(body: unknown): FomoHit | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  const source = data && typeof data === "object" ? data as Record<string, unknown> : body as Record<string, unknown>;
  const identities = Array.isArray(source.identities) ? source.identities : [];
  const identity = source.identity && typeof source.identity === "object" ? source.identity as Record<string, unknown> : identities[0] as Record<string, unknown> | undefined;
  const handle = typeof source.handle === "string" ? source.handle : typeof identity?.handle === "string" ? identity.handle : null;
  const identityId = typeof source.id === "string" ? source.id : typeof identity?.id === "string" ? identity.id : null;
  return handle || identityId ? { handle, confidence: null, identityId } : null;
}

async function resolveFomoScan(wallets: string[]) {
  const key = process.env.FOMOSCAN_API_KEY;
  if (!key) return new Map<string, FomoHit | null>();
  const base = (process.env.FOMOSCAN_BASE || "https://api.fomoscan.sh").replace(/\/$/, "");
  const results = new Map<string, FomoHit | null>();
  for (let i = 0; i < wallets.length; i += 4) {
    const group = wallets.slice(i, i + 4);
    const items = await Promise.all(group.map(async wallet => {
      const response = await timedFetch(`${base}/v2/user/wallet/${encodeURIComponent(wallet)}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
      if (response.status === 404) return [wallet, null] as const;
      if (!response.ok) throw new Error(`FomoScan returned ${response.status}`);
      return [wallet, parseFomoScanProfile(await response.json())] as const;
    }));
    for (const [wallet, value] of items) results.set(wallet, value);
  }
  return results;
}

export async function resolveFomo(wallets: string[]): Promise<Map<string, FomoHit>> {
  const result = new Map<string, FomoHit>();
  const unknown: string[] = [];
  for (const wallet of wallets) {
    const item = memory.get(wallet);
    if (item && item.expires > Date.now()) { if (item.value) result.set(wallet, item.value); }
    else unknown.push(wallet);
  }
  if (!unknown.length) return result;
  // FomoScan is the preferred proof-verified source. Only unresolved wallets fall back to FomoTags.
  try {
    const scanned = await resolveFomoScan(unknown);
    const unresolved = unknown.filter(wallet => !scanned.get(wallet));
    for (const [wallet, value] of scanned) {
      if (value) {
        memory.set(wallet, { value, expires: Date.now() + 86_400_000 });
        result.set(wallet, value);
      }
    }
    if (!unresolved.length) return result;
    const base = (process.env.FOMOTAGS_BASE || "https://api.fomotags.xyz").replace(/\/$/, "");
    for (let i = 0; i < unresolved.length; i += 100) {
      const group = unresolved.slice(i, i + 100);
      const response = await timedFetch(`${base}/v1/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallets: group }) });
      if (!response.ok) throw new Error(`FomoTags returned ${response.status}`);
      const body = await response.json() as { results?: Array<{ wallet?: string; address?: string; handle?: string; username?: string; confidence?: number }> };
      const found = new Map((body.results || []).map(x => [x.wallet || x.address, { handle: x.handle || x.username || null, confidence: x.confidence ?? null, identityId: null }]));
      for (const wallet of group) {
        const value = found.get(wallet) || null;
        memory.set(wallet, { value, expires: Date.now() + 86_400_000 });
        if (value) result.set(wallet, value);
      }
    }
  } catch {
    // Labeling is optional: callers continue with neutral labels when the index is unavailable.
    for (const wallet of unknown) memory.set(wallet, { value: null, expires: Date.now() + 60_000 });
  }
  return result;
}
