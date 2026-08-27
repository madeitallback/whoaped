import { readTokenSocialActors } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/data/supabase";
import { isSolanaAddress } from "@/lib/providers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint")?.trim() ?? "";
  if (!isSolanaAddress(mint)) return Response.json({ error: "A valid Solana mint is required." }, { status: 400 });
  if (!isSupabaseConfigured()) {
    return Response.json({ actors: [], persistence: "unavailable", coverage: "not_started" });
  }
  try {
    const actors = await readTokenSocialActors(mint);
    return Response.json({ actors, persistence: "ready", coverage: actors.length ? "partial" : "not_started" });
  } catch (error) {
    console.error("[token/social] read failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ actors: [], persistence: "degraded", coverage: "failed" }, { status: 503 });
  }
}
