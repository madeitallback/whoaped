import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisProfile, WatchlistEntry } from "@/lib/types";
import { isSupabaseConfigured, supabaseRequest } from "./data/supabase";

type Store = { profiles: Record<string, AnalysisProfile>; watchlist: WatchlistEntry[] };
const empty: Store = { profiles: {}, watchlist: [] };
const storePath = process.env.WHOAPED_DATA_FILE || process.env.WHOHELD_DATA_FILE || process.env.FOLLOWER_ALPHA_DATA_FILE || path.join(process.cwd(), ".data", "whoaped.json");
function hasSupabase() { return isSupabaseConfigured(); }
function headers(extra: Record<string, string> = {}) { return { "Content-Type": "application/json", ...extra }; }
const supabase = supabaseRequest;
async function readStore(): Promise<Store> { try { return JSON.parse(await readFile(storePath, "utf8")) as Store; } catch { return structuredClone(empty); } }
async function save(store: Store) { await mkdir(path.dirname(storePath), { recursive: true }); await writeFile(storePath, JSON.stringify(store, null, 2)); }

export async function saveProfile(profile: AnalysisProfile) {
  if (hasSupabase()) {
    await supabase("profiles?on_conflict=id", { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates" }), body: JSON.stringify({ id: profile.id, source: profile.source, payload: profile, updated_at: new Date(profile.updatedAt).toISOString() }) });
    return profile;
  }
  const store = await readStore(); store.profiles[profile.id] = profile; await save(store); return profile;
}

export async function saveProfiles(profiles: AnalysisProfile[]) {
  if (!profiles.length) return profiles;
  if (hasSupabase()) {
    await supabase("profiles?on_conflict=id", { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates" }), body: JSON.stringify(profiles.map((profile) => ({ id: profile.id, source: profile.source, payload: profile, updated_at: new Date(profile.updatedAt).toISOString() }))) });
    return profiles;
  }
  const store = await readStore();
  for (const profile of profiles) store.profiles[profile.id] = profile;
  await save(store);
  return profiles;
}

export async function getProfile(id: string) {
  if (hasSupabase()) { const response = await supabase(`profiles?id=eq.${encodeURIComponent(id)}&select=payload`); const rows = await response.json() as Array<{ payload: AnalysisProfile }>; return rows[0]?.payload ?? null; }
  return (await readStore()).profiles[id] ?? null;
}

export async function listProfiles(limit = 100) {
  if (hasSupabase()) { const response = await supabase(`profiles?select=payload&order=updated_at.desc&limit=${limit}`); const rows = await response.json() as Array<{ payload: AnalysisProfile }>; return rows.map((row) => row.payload).sort((a, b) => (b.metrics.score ?? -1) - (a.metrics.score ?? -1) || b.updatedAt - a.updatedAt); }
  const store = await readStore(); return Object.values(store.profiles).sort((a, b) => (b.metrics.score ?? -1) - (a.metrics.score ?? -1) || b.updatedAt - a.updatedAt).slice(0, limit);
}

export async function listWatchlist() {
  if (hasSupabase()) { const response = await supabase("watchlist?select=profiles(payload)&order=created_at.desc"); const rows = await response.json() as Array<{ profiles: { payload: AnalysisProfile } | null }>; return rows.flatMap((row) => row.profiles?.payload ? [row.profiles.payload] : []); }
  const store = await readStore(); return store.watchlist.map((item) => store.profiles[item.profileId]).filter(Boolean);
}

export async function addWatchlist(profileId: string) {
  if (hasSupabase()) { await supabase("watchlist?on_conflict=profile_id", { method: "POST", headers: headers({ Prefer: "resolution=ignore-duplicates" }), body: JSON.stringify({ profile_id: profileId }) }); return; }
  const store = await readStore(); if (!store.profiles[profileId]) throw new Error("Profile not found."); if (!store.watchlist.some((item) => item.profileId === profileId)) { store.watchlist.unshift({ profileId, createdAt: Date.now() }); await save(store); }
}
