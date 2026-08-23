import { PublicKey } from "@solana/web3.js";
import { findCurveBuyerPage } from "@/lib/buyers";
import { createHeliusJob, listHeliusJobs, updateScanJob, upsertHeliusCurveBuyers } from "@/lib/supabase";
import { connection } from "@/lib/solana";

type CursorPayload = { curve?: string; cursor?: string | null; pages?: number; scanned_signatures?: number; buyers_found?: number };

export async function enqueueHeliusCurveIndex(mint: string, curve: string | null) {
  if (!process.env.HELIUS_API_KEY || !curve) return false;
  const existing = await listHeliusJobs(mint);
  if (existing.some(job => job.job_type === "curve_history" && job.status !== "failed")) return false;
  await createHeliusJob(mint, "curve_history", { curve, cursor: null, pages: 0, scanned_signatures: 0, buyers_found: 0 });
  return true;
}

/** Process one bounded page per invocation; scanning stays below request timeouts. */
export async function advanceHeliusJobs(mint: string) {
  const job = (await listHeliusJobs(mint, ["queued", "running"])).find(item => item.job_type === "curve_history");
  if (!job) return false;
  const payload = (job.payload || {}) as CursorPayload;
  if (!payload.curve) {
    await updateScanJob(job.id, { status: "failed", error: "Curve address was missing from the index job." });
    return true;
  }
  try {
    const page = await findCurveBuyerPage(connection(), new PublicKey(payload.curve), new PublicKey(mint), payload.cursor);
    await upsertHeliusCurveBuyers(mint, page.buyers);
    await updateScanJob(job.id, {
      status: page.nextCursor ? "running" : "completed",
      payload: {
        ...payload,
        cursor: page.nextCursor,
        pages: (payload.pages || 0) + 1,
        scanned_signatures: (payload.scanned_signatures || 0) + page.scannedSignatures,
        buyers_found: (payload.buyers_found || 0) + page.buyers.length,
      },
      result: page.nextCursor ? null : { complete: true },
    });
    return true;
  } catch (error) {
    await updateScanJob(job.id, { status: "failed", error: error instanceof Error ? error.message : "Helius index failed" });
    return true;
  }
}

export async function heliusIndexState(mint: string) {
  const jobs = await listHeliusJobs(mint);
  const job = [...jobs].reverse().find(item => item.job_type === "curve_history" && item.status !== "cancelled");
  return job?.status || "not_started";
}
