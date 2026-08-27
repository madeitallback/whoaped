import { PublicKey } from "@solana/web3.js";
import { claimIngestionJobs, completeIngestionJob, continueIngestionJob, failIngestionJob, persistTokenScan, replaceTokenPositions, upsertVerifiedTradeEvents } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/data/supabase";
import { indexAllHolders } from "@/lib/indexing/holders";
import { findPumpSwapBuyerPage } from "@/lib/indexing/pumpswap";
import { findCurveBuyerPage } from "@/lib/token-intel/buyers";
import { connection } from "@/lib/token-intel/solana";
import { parseMintInput } from "@/lib/token-intel/solana";
import { scanToken } from "@/lib/token-intel/scan";
import { dispatchWorker } from "@/lib/worker-dispatch";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_HISTORY_PAGES_PER_JOB = 100;

function withTimeout<T>(work: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race<T>([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

async function runWorker(request: Request) {
  const authorization = request.headers.get("authorization");
  const workerSecret = process.env.WORKER_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const authorized = (workerSecret && authorization === `Bearer ${workerSecret}`)
    || (cronSecret && authorization === `Bearer ${cronSecret}`);
  if (!authorized) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  // Claim one job per invocation so a slow provider call cannot hold a second
  // leased job that this function never gets a chance to process.
  const jobs = await claimIngestionJobs(1);
  const results: Array<{ id: number; mint: string; status: "completed" | "continued" | "failed" }> = [];
  for (const job of jobs) {
    const mint = parseMintInput(job.resource_key);
    if (!mint || !["token_refresh_v1", "holder_snapshot_v1", "curve_history_v1", "pumpswap_history_v1"].includes(job.job_type)) {
      await failIngestionJob(job.id, "Unsupported or invalid ingestion job.");
      results.push({ id: job.id, mint: job.resource_key, status: "failed" });
      continue;
    }
    try {
      if (job.job_type === "curve_history_v1" || job.job_type === "pumpswap_history_v1") {
        const cursor = typeof job.payload.cursor === "string" ? job.payload.cursor : null;
        const page = job.job_type === "curve_history_v1"
          ? await findCurveBuyerPage(connection(), new PublicKey(String(job.payload.curve)), mint, cursor)
          : await findPumpSwapBuyerPage(connection(), mint, cursor);
        await upsertVerifiedTradeEvents(mint.toBase58(), page.events);
        const nextPayload = {
          ...job.payload,
          cursor: page.nextCursor,
          pages: Number(job.payload.pages || 0) + 1,
          scanned_signatures: Number(job.payload.scanned_signatures || 0) + page.scannedSignatures,
          events_found: Number(job.payload.events_found || 0) + page.events.length,
        };
        if (page.nextCursor && Number(nextPayload.pages) < MAX_HISTORY_PAGES_PER_JOB) {
          await continueIngestionJob(job.id, nextPayload);
          results.push({ id: job.id, mint: mint.toBase58(), status: "continued" });
        } else {
          await completeIngestionJob(job.id, {
            ...nextPayload,
            complete: !page.nextCursor,
            truncated_reason: page.nextCursor ? "page_budget" : null,
          });
          results.push({ id: job.id, mint: mint.toBase58(), status: "completed" });
        }
        continue;
      }
      if (job.job_type === "holder_snapshot_v1") {
        const snapshot = await withTimeout(
          indexAllHolders(mint.toBase58()),
          45_000,
          "Complete holder indexing exceeded the current function time budget; partial live holders remain available.",
        );
        await replaceTokenPositions(mint.toBase58(), snapshot.observedAt, snapshot.holders);
        await completeIngestionJob(job.id, { mint: mint.toBase58(), observed_at: snapshot.observedAt, holder_count: snapshot.holders.length, token_account_count: snapshot.tokenAccountCount });
        results.push({ id: job.id, mint: mint.toBase58(), status: "completed" });
        continue;
      }
      const scan = await scanToken(mint);
      await persistTokenScan(scan);
      await completeIngestionJob(job.id, { mint, observed_at: scan.updatedAt, holder_state: scan.coverage.holderState, buyer_state: scan.coverage.buyerState });
      results.push({ id: job.id, mint: mint.toBase58(), status: "completed" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Token refresh failed.";
      await failIngestionJob(job.id, message);
      results.push({ id: job.id, mint: mint.toBase58(), status: "failed" });
    }
  }
  if (jobs.length > 0) after(() => dispatchWorker(request.url));
  return Response.json({ ok: true, claimed: jobs.length, results, drainScheduled: jobs.length > 0 });
}

export const POST = runWorker;
export const GET = runWorker;
