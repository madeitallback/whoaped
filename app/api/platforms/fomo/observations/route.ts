import { persistFomoFirstPartyLeaderboard, readFomoFirstPartyLeaderboard } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/data/supabase";
import { parseFomoLeaderboardCapture } from "@/lib/platforms/fomo/observations";

export const runtime = "nodejs";

const WINDOWS = new Set(["24h", "7d", "30d", "all"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedWindow = (url.searchParams.get("window") || "24h").toLowerCase();
  if (!WINDOWS.has(requestedWindow)) return Response.json({ error: "window must be 24h, 7d, 30d, or all." }, { status: 400 });
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 100));
  try {
    const rows = (await readFomoFirstPartyLeaderboard(requestedWindow as "24h" | "7d" | "30d" | "all")).slice(0, limit);
    return Response.json({ rows, count: rows.length, window: requestedWindow, capturedAt: rows[0]?.capturedAt ?? null, source: "whoaped_first_party" }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (error) {
    console.error("[fomo-observations] read failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Fomo observations are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Fomo observation storage is unavailable." }, { status: 503 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 500_000) return Response.json({ error: "Fomo observation capture is too large." }, { status: 413 });
  try {
    const capture = parseFomoLeaderboardCapture(await request.json());
    const result = await persistFomoFirstPartyLeaderboard(capture.window, capture.sourceUrl, capture.rows);
    return Response.json({ captured: result ? result.affected : 0, capturedAt: result ? result.capturedAt : null, window: capture.window, source: "authorized_visible_capture" }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fomo observation capture failed.";
    const invalid = /required|valid|originate|visible|at most/i.test(message);
    if (!invalid) console.error("[fomo-observations] capture failed", { error: message });
    return Response.json({ error: invalid ? message : "Fomo observation capture is temporarily unavailable." }, { status: invalid ? 400 : 503 });
  }
}
