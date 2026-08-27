import { readTokenActivity } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/data/supabase";
import { parseMintInput } from "@/lib/token-intel/solana";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const mint = parseMintInput(new URL(request.url).searchParams.get("mint") || "");
  if (!mint) return Response.json({ error: "A valid Solana mint is required." }, { status: 400 });
  if (!isSupabaseConfigured()) return Response.json({ positions: [], events: [], coverage: "unavailable" });
  try {
    const activity = await readTokenActivity(mint.toBase58());
    return Response.json({ ...activity, coverage: activity.events.length ? "indexed" : "indexing" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[token/activity] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ positions: [], events: [], coverage: "unavailable" }, { status: 503 });
  }
}
