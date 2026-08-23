import { PublicKey } from "@solana/web3.js";
import { findCurveBuyerPage } from "@/lib/buyers";
import { createHeliusJob, listHeliusJobs, updateScanJob, upsertHeliusCurveBuyers } from "@/lib/supabase";
import { connection } from "@/lib/solana";

const CURVE_DECODER_VERSION = 2;
type CursorPayload = { curve?: string; cursor?: string | null; pages?: number; scanned_signatures?: number; buyers_found?: number; decoder_version?: number };

export type CurveIndexProgress = { state: string; pages: number; scannedSignatures: number; buyersFound: number; decoderVersion: number | null };

function curvePayload(job: { payload: Record<string, unknown> | null }) { return (job.payload || {}) as CursorPayload; }

export async function enqueueHeliusCurveIndex(mint: string, curve: string | null) {
  if (!process.env.HELIUS_API_KEY || !curve) return false;
  const existing = await listHeliusJobs(mint);
  const latest = [...existing].reverse().find(job => job.job_type === "curve_history" && job.status !== "failed" && job.status !== "cancelled");
  if (latest) {
    const payload = curvePayload(latest);
    if ((payload.decoder_version || 1) < CURVE_DECODER_VERSION && (latest.status === "completed" || latest.status === "queued")) {
      await updateScanJob(latest.id, {
        status: "queued", result: null, error: null,
        payload: { curve: payload.curve || curve, cursor: null, pages: 0, scanned_signatures: 0, buyers_found: 0, decoder_version: CURVE_DECODER_VERSION },
      });
      return true;
    }
    return false;
  }
  await createHeliusJob(mint, "curve_history", { curve, cursor: null, pages: 0, scanned_signatures: 0, buyers_found: 0, decoder_version: CURVE_DECODER_VERSION });
  return true;
}

/** Process one bounded page per invocation; scanning stays below request timeouts. */
export async function advanceHeliusJobs(mint: string) {
  const job = [...(await listHeliusJobs(mint, ["queued", "running"]))].reverse().find(item => item.job_type === "curve_history");
  if (!job) return false;
  const payload = curvePayload(job);
  if ((payload.decoder_version || 1) < CURVE_DECODER_VERSION) {
    await updateScanJob(job.id, {
      status: "queued", result: null, error: null,
      payload: { curve: payload.curve, cursor: null, pages: 0, scanned_signatures: 0, buyers_found: 0, decoder_version: CURVE_DECODER_VERSION },
    });
    return true;
  }
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
        decoder_version: CURVE_DECODER_VERSION,
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
  return (await heliusIndexProgress(mint)).state;
}

export async function heliusIndexProgress(mint: string): Promise<CurveIndexProgress> {
  const jobs = await listHeliusJobs(mint);
  const job = [...jobs].reverse().find(item => item.job_type === "curve_history" && item.status !== "cancelled");
  if (!job) return { state: "not_started", pages: 0, scannedSignatures: 0, buyersFound: 0, decoderVersion: null };
  const payload = curvePayload(job);
  return {
    state: job.status,
    pages: Number(payload.pages || 0),
    scannedSignatures: Number(payload.scanned_signatures || 0),
    buyersFound: Number(payload.buyers_found || 0),
    decoderVersion: payload.decoder_version ? Number(payload.decoder_version) : 1,
  };
}
