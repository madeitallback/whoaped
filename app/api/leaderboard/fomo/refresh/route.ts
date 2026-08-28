import { openFomoStorageState, sealFomoStorageState } from "@/lib/platforms/fomo/session-crypto";
import {
  claimFomoCollector,
  claimFomoTokenCaptureJob,
  completeIngestionJob,
  completeFomoCollector,
  failIngestionJob,
  failFomoCollector,
  persistFomoFirstPartyLeaderboard,
  persistFomoHolderCaptures,
  readTokenActivity,
} from "@/lib/data/repository";
import { resolveFomoHolderCapturesWithEvidence } from "@/lib/token-intel/fomo-holder-capture";
import { fetchFomoWalletTradeEvidence } from "@/lib/token-intel/fomo-chain-evidence";
import { refreshFomoWalletMetrics } from "@/lib/fomo-leaderboard-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 280;

function authorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return Boolean(
    (process.env.WORKER_SECRET && authorization === `Bearer ${process.env.WORKER_SECRET}`)
    || (process.env.CRON_SECRET && authorization === `Bearer ${process.env.CRON_SECRET}`),
  );
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const claim = await claimFomoCollector();
  if (!claim) return Response.json({ ok: true, skipped: true, reason: "setup_required_or_already_running" });
  try {
    const { collectFomoLeaderboards } = await import("@/lib/platforms/fomo/cloud-collector");
    const result = await collectFomoLeaderboards(openFomoStorageState(claim.sealedSession));
    const counts: Record<string, number> = {};
    for (const snapshot of result.snapshots) {
      const persisted = await persistFomoFirstPartyLeaderboard(snapshot.window, snapshot.sourceUrl, snapshot.rows);
      counts[snapshot.window] = persisted ? persisted.affected : 0;
    }
    const tokenJob = await claimFomoTokenCaptureJob();
    if (tokenJob) {
      try {
        const { collectFomoTokenHolders } = await import("@/lib/platforms/fomo/cloud-collector");
        const capture = await collectFomoTokenHolders(tokenJob.resource_key);
        const activity = await readTokenActivity(tokenJob.resource_key);
        const resolved = await resolveFomoHolderCapturesWithEvidence(capture.holders, activity.positions.filter((position) => position.balanceUi > 0), (wallet, trades) => fetchFomoWalletTradeEvidence(wallet, tokenJob.resource_key, trades));
        const affected = await persistFomoHolderCaptures(tokenJob.resource_key, capture.sourceUrl, resolved);
        const metricRefresh = await refreshFomoWalletMetrics(resolved.flatMap((row) => row.wallet ? [{ handle: row.handle, wallet: row.wallet }] : [])).catch((error) => ({ refreshed: 0, skipped: 0, error: error instanceof Error ? error.message : "Fomo wallet metrics refresh failed." }));
        await completeIngestionJob(tokenJob.id, { captured: affected, linked: resolved.filter((row) => row.wallet).length, unresolved: resolved.filter((row) => !row.wallet).length, source_url: capture.sourceUrl, metric_refresh: metricRefresh });
      } catch (captureError) {
        await failIngestionJob(tokenJob.id, captureError instanceof Error ? captureError.message : "Fomo token capture failed.");
      }
    }
    await completeFomoCollector(claim.claimToken, result.storageState ? sealFomoStorageState(result.storageState) : claim.sealedSession, counts);
    return Response.json({ ok: true, counts, refreshedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fomo collector failed.";
    await failFomoCollector(claim.claimToken, message).catch(() => undefined);
    console.error("[fomo-cloud-collector] refresh failed", { error: message });
    return Response.json({ ok: false, error: message }, { status: 503 });
  }
}

export const POST = run;
export const GET = run;
