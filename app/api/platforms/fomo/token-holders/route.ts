import { persistFomoHolderCaptures, readTokenActivity } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/data/supabase";
import { resolveFomoHolderCaptures, type FomoHolderCapture } from "@/lib/token-intel/fomo-holder-capture";
import { parseMintInput } from "@/lib/token-intel/solana";

export const runtime = "nodejs";

function validSource(sourceUrl: string, mint: string) {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "https:" && url.hostname === "fomo.family" && url.pathname.includes(mint);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Holder storage is unavailable." }, { status: 503 });
  let body: { mint?: unknown; sourceUrl?: unknown; holders?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const mint = parseMintInput(typeof body.mint === "string" ? body.mint : "")?.toBase58();
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
  if (!mint || !validSource(sourceUrl, mint)) return Response.json({ error: "A valid Fomo Solana token page is required." }, { status: 400 });
  if (!Array.isArray(body.holders) || body.holders.length > 100) return Response.json({ error: "Provide at most 100 visible holders." }, { status: 400 });
  const captures = body.holders.flatMap((item): FomoHolderCapture[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.handle !== "string" || typeof row.amountText !== "string") return [];
    const optionalNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
    return [{ handle: row.handle, amountText: row.amountText, holdTimeText: typeof row.holdTimeText === "string" ? row.holdTimeText : null, valueUsd: optionalNumber(row.valueUsd), pnlUsd: optionalNumber(row.pnlUsd), roiPct: optionalNumber(row.roiPct) }];
  });
  if (!captures.length) return Response.json({ error: "No valid visible holder row was found." }, { status: 400 });

  const activity = await readTokenActivity(mint);
  const resolved = resolveFomoHolderCaptures(captures, activity.positions.filter((position) => position.balanceUi > 0));
  const affected = await persistFomoHolderCaptures(mint, sourceUrl, resolved);
  const linked = resolved.filter((capture) => capture.wallet).length;
  return Response.json({ captured: affected, linked, unresolved: resolved.length - linked, holderSnapshotReady: activity.positions.some((position) => position.balanceUi > 0) }, { headers: { "Cache-Control": "private, no-store" } });
}
