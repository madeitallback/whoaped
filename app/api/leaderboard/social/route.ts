import { fetchFomoLeaderboard, pumpProfilesToBoard } from "@/lib/social-leaderboard";
import { listProfiles } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const [profiles, fomo] = await Promise.all([
    listProfiles(100).catch(() => []),
    fetchFomoLeaderboard().catch(() => ({ rows: [], capturedAt: null, configured: Boolean(process.env.FOMOSCAN_API_KEY) })),
  ]);
  const pump = pumpProfilesToBoard(profiles);
  return Response.json({
    rows: [...fomo.rows, ...pump],
    sources: { fomo: fomo.rows.length ? "live" : fomo.configured ? "degraded" : "not_configured", pump: pump.length ? "verified_analysis" : "awaiting_analysis" },
    capturedAt: fomo.capturedAt || new Date().toISOString(),
    methodology: "Fomo uses its official rolling 24h realized-PnL board. Pump uses WHOAPED wallet analyses ranked by transparent performance score; windows are never silently mixed.",
  });
}
