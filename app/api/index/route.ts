import { NextResponse } from "next/server";
import { advanceDuneJobs, duneIndexState } from "@/lib/dune";
import { advanceHeliusJobs, heliusIndexProgress, heliusIndexState } from "@/lib/helius-index";
import { advanceHolderJobs, holderIndexProgress } from "@/lib/holder-index";
import { advanceLabelJobs, labelIndexProgress } from "@/lib/label-index";
import { parseMintInput } from "@/lib/solana";

export const runtime = "nodejs";

const lastTick = new Map<string, number>();

/** Advances at most one Helius page and one Dune poll every 12 seconds per mint. */
export async function POST(request: Request) {
  try {
    const { mint: input } = await request.json() as { mint?: string };
    const mint = input ? parseMintInput(input) : null;
    if (!mint) return NextResponse.json({ ok: false, error: "A valid Solana mint is required." }, { status: 400 });
    const value = mint.toBase58();
    const now = Date.now();
    if ((lastTick.get(value) || 0) + 12_000 <= now) {
      lastTick.set(value, now);
      await advanceDuneJobs(value).catch(() => false);
      await advanceHeliusJobs(value).catch(() => false);
      await advanceHolderJobs(value).catch(() => false);
      await advanceLabelJobs(value).catch(() => false);
    }
    const [dune, helius, curve, holders, labels] = await Promise.all([duneIndexState(value), heliusIndexState(value), heliusIndexProgress(value), holderIndexProgress(value), labelIndexProgress(value)]);
    return NextResponse.json({ ok: true, dune, helius, curve, holders, labels });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not advance this index." }, { status: 500 });
  }
}
