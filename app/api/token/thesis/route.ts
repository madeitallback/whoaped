import { captureThesisEvidence, persistFomoTokenTheses, readTokenTheses } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/data/supabase";
import { isSolanaAddress } from "@/lib/providers";
import { parseThesisCapture, thesisContentHash } from "@/lib/thesis-evidence";
import { fetchFomoTokenTheses } from "@/lib/token-intel/fomo-theses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint")?.trim() ?? "";
  if (!isSolanaAddress(mint)) return Response.json({ error: "A valid Solana mint is required." }, { status: 400 });
  if (!isSupabaseConfigured()) return Response.json({ evidence: [], persistence: "unavailable", coverage: "not_started" });
  try {
    let evidence = await readTokenTheses(mint);
    const newestCapture = evidence.reduce((latest, item) => Math.max(latest, Date.parse(item.capturedAt) || 0), 0);
    const cacheFresh = newestCapture > Date.now() - 15 * 60_000;
    let provider: "first_party" | "fomoscan_fallback" | "collection_required" = evidence.length ? "first_party" : "collection_required";
    if (!cacheFresh && process.env.FOMOSCAN_FALLBACK_ENABLED === "true") {
      try {
        const fomo = await fetchFomoTokenTheses(mint);
        provider = fomo.configured ? "fomoscan_fallback" : "collection_required";
        if (fomo.theses.length) {
          await persistFomoTokenTheses(mint, fomo.theses);
          evidence = await readTokenTheses(mint);
        }
      } catch (providerError) {
        console.error("[token/thesis] FomoScan refresh failed", { error: providerError instanceof Error ? providerError.message : String(providerError) });
      }
    }
    return Response.json({ evidence, persistence: "ready", coverage: evidence.length ? "partial" : "not_started", provider, refreshedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[token/thesis] read failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ evidence: [], persistence: "degraded", coverage: "failed" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Evidence storage is not configured." }, { status: 503 });
  try {
    const input = parseThesisCapture(await request.json());
    const contentHash = thesisContentHash(input);
    const id = await captureThesisEvidence(input, contentHash);
    return Response.json({ id, contentHash, captured: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evidence capture failed.";
    const invalid = /required|invalid|must|characters|URL|Platform|Relevance|time/.test(message);
    if (!invalid) console.error("[token/thesis] capture failed", { error: message });
    return Response.json({ error: invalid ? message : "Evidence capture is temporarily unavailable." }, { status: invalid ? 400 : 503 });
  }
}
