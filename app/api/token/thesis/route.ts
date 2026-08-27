import { captureThesisEvidence, readTokenTheses } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/data/supabase";
import { isSolanaAddress } from "@/lib/providers";
import { parseThesisCapture, thesisContentHash } from "@/lib/thesis-evidence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint")?.trim() ?? "";
  if (!isSolanaAddress(mint)) return Response.json({ error: "A valid Solana mint is required." }, { status: 400 });
  if (!isSupabaseConfigured()) return Response.json({ evidence: [], persistence: "unavailable", coverage: "not_started" });
  try {
    const evidence = await readTokenTheses(mint);
    return Response.json({ evidence, persistence: "ready", coverage: evidence.length ? "partial" : "not_started" });
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
