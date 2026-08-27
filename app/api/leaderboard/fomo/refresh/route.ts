import { openFomoStorageState, sealFomoStorageState } from "@/lib/platforms/fomo/session-crypto";
import {
  claimFomoCollector,
  completeFomoCollector,
  failFomoCollector,
  persistFomoFirstPartyLeaderboard,
} from "@/lib/data/repository";

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
    await completeFomoCollector(claim.claimToken, sealFomoStorageState(result.storageState), counts);
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
