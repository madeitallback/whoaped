import { NextRequest, NextResponse } from "next/server";
import { advanceDuneJobs, duneIndexState } from "@/lib/dune";
import { advanceHeliusJobs, heliusIndexState } from "@/lib/helius-index";
import { advanceHolderJobs, holderIndexProgress } from "@/lib/holder-index";
import { claimActiveJobMints } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 55;

function authorized(request: NextRequest) {
  const secret = process.env.WORKER_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

/** Called by Supabase Cron; it claims a tiny, locked batch so duplicate cron
 * deliveries cannot process the same jobs concurrently. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const mints = await claimActiveJobMints(2);
    const jobs = [] as Array<{ mint: string; dune: string; helius: string; holders: string }>;
    for (const mint of mints) {
      await advanceDuneJobs(mint);
      await advanceHeliusJobs(mint);
      await advanceHolderJobs(mint);
      jobs.push({ mint, dune: await duneIndexState(mint), helius: await heliusIndexState(mint), holders: (await holderIndexProgress(mint)).state });
    }
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Worker failed" }, { status: 500 });
  }
}
