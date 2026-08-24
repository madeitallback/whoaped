import { NextRequest, NextResponse } from "next/server";
import { parseMintInput } from "@/lib/solana";
import { loadDuneHistoricalSupplySnapshots, loadSupplySnapshots } from "@/lib/supabase";

export const runtime = "nodejs";

/** First-party ownership history. Every point carries the completeness state,
 * so the client never turns an unindexed interval into an exact-looking line. */
export async function GET(request: NextRequest) {
  const mint = parseMintInput(request.nextUrl.searchParams.get("mint") || "");
  if (!mint) return NextResponse.json({ ok: false, error: "A valid Solana mint is required." }, { status: 400 });
  try {
    const [observed, dune] = await Promise.all([loadSupplySnapshots(mint.toBase58()), loadDuneHistoricalSupplySnapshots(mint.toBase58()).catch(() => [])]);
    const points = [...dune, ...observed].sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
    return NextResponse.json({ ok: true, points });
  } catch {
    return NextResponse.json({ ok: false, error: "Historical snapshots are not available yet." }, { status: 503 });
  }
}
