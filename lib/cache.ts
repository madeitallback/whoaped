const cache = new Map<string, { expires: number; value: unknown }>();
export function cached<T>(key: string): T | null { const hit = cache.get(key); return hit && hit.expires > Date.now() ? hit.value as T : null; }
export function store<T>(key: string, value: T, ttlMs = 30_000) { cache.set(key, { value, expires: Date.now() + ttlMs }); }
