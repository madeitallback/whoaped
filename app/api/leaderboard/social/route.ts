import { fetchFomoLeaderboard, pumpProfilesToBoard } from "@/lib/social-leaderboard";
import { listProfiles } from "@/lib/store";
import { after } from "next/server";
import { PUMP_REFRESH_TTL_MS, refreshPumpLeaderboard } from "@/lib/pump-leaderboard-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const [profiles, fomo] = await Promise.all([
    listProfiles(100).catch(() => []),
    fetchFomoLeaderboard().catch(() => ({ rows: [], capturedAt: null, configured: true, stale: false, source: "none" as const })),
  ]);
  const pump = pumpProfilesToBoard(profiles);
  const pumpDailyFresh = profiles.some((profile) => profile.dataset === "pump_daily_v2" && profile.updatedAt >= Date.now() - PUMP_REFRESH_TTL_MS);
  if (!pumpDailyFresh) after(() => refreshPumpLeaderboard(false).catch((error) => console.error("[social-leaderboard] background Pump refresh failed", { error: error instanceof Error ? error.message : String(error) })));
  return Response.json({
    rows: [...fomo.rows, ...pump],
    sources: { fomo: fomo.rows.length ? fomo.stale ? "first_party_cached" : fomo.source === "first_party" ? "first_party_live" : "provider_fallback" : "collection_required", pump: pumpDailyFresh ? "daily_live" : pump.length ? "verified_analysis_refreshing" : "refreshing" },
    capturedAt: fomo.capturedAt || new Date().toISOString(),
    methodology: "Fomo uses FomoScan's rolling 24h leaderboard, shared-cached for five minutes; an authorized first-party snapshot is used only during a provider outage. Pump uses verified 90d wallet behavior. Wallet metrics are shown only after a verified wallet match.",
  }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } });
}
