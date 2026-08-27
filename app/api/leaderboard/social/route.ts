import { fetchFomoLeaderboard, pumpProfilesToBoard } from "@/lib/social-leaderboard";
import { listProfiles } from "@/lib/store";
import { after } from "next/server";
import { PUMP_REFRESH_TTL_MS, refreshPumpLeaderboard } from "@/lib/pump-leaderboard-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const [profiles, fomo] = await Promise.all([
    listProfiles(100).catch(() => []),
    fetchFomoLeaderboard().catch(() => ({ rows: [], capturedAt: null, configured: Boolean(process.env.FOMOSCAN_API_KEY) })),
  ]);
  const pump = pumpProfilesToBoard(profiles);
  const pumpDailyFresh = profiles.some((profile) => profile.id.startsWith("pump-daily:") && profile.updatedAt >= Date.now() - PUMP_REFRESH_TTL_MS);
  if (!pumpDailyFresh) after(() => refreshPumpLeaderboard(false).catch((error) => console.error("[social-leaderboard] background Pump refresh failed", { error: error instanceof Error ? error.message : String(error) })));
  return Response.json({
    rows: [...fomo.rows, ...pump],
    sources: { fomo: fomo.rows.length ? "live" : fomo.configured ? "degraded" : "not_configured", pump: pumpDailyFresh ? "daily_live" : pump.length ? "verified_analysis_refreshing" : "refreshing" },
    capturedAt: fomo.capturedAt || new Date().toISOString(),
    methodology: "Fomo uses its official rolling 24h realized-PnL board. Pump uses WHOAPED wallet analyses ranked by transparent performance score; windows are never silently mixed.",
  });
}
