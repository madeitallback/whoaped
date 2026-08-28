import { fetchFomoLeaderboard, pumpProfilesToBoard } from "@/lib/social-leaderboard";
import { listProfiles } from "@/lib/store";
import { after } from "next/server";
import { hasFreshPumpDailyProfiles, refreshPumpLeaderboard } from "@/lib/pump-leaderboard-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const [profiles, fomo] = await Promise.all([
    listProfiles(100).catch(() => []),
    fetchFomoLeaderboard().catch(() => ({ rows: [], capturedAt: null, configured: true, stale: false, source: "none" as const })),
  ]);
  const pump = pumpProfilesToBoard(profiles);
  const pumpDailyFresh = await hasFreshPumpDailyProfiles();
  if (!pumpDailyFresh) after(() => refreshPumpLeaderboard(false).catch((error) => console.error("[social-leaderboard] background Pump refresh failed", { error: error instanceof Error ? error.message : String(error) })));
  return Response.json({
    rows: [...fomo.rows, ...pump],
    sources: { fomo: fomo.rows.length ? fomo.stale ? "first_party_cached" : fomo.source === "first_party" ? "first_party_live" : "provider_fallback" : "collection_required", pump: pumpDailyFresh ? "daily_live" : pump.length ? "verified_analysis_refreshing" : "refreshing" },
    capturedAt: fomo.capturedAt || new Date().toISOString(),
    methodology: "Both sources expose a 50-profile daily cohort. Fomo PnL is FomoScan's rolling 24h result; Pump PnL, win rate, return, and profit factor are WHOAPED-verified closed lots over 90d. Values with different windows are labelled, never blended.",
  }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } });
}
