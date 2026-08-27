import { enqueueBuyerHistory, enqueueHolderSnapshot, enqueueTokenRefresh, persistTokenScan } from "@/lib/data/repository";
import { parseMintInput } from "@/lib/token-intel/solana";
import { scanToken } from "@/lib/token-intel/scan";
import { dispatchWorker } from "@/lib/worker-dispatch";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { input?: string };
    const mint = parseMintInput(body.input || "");
    if (!mint) return Response.json({ ok: false, code: "INVALID_MINT", error: "Paste a valid Solana mint or Pump.fun coin URL." }, { status: 400 });
    const scan = await scanToken(mint);
    let persisted = false;
    let queued = false;
    let holderSnapshotQueued = false;
    let historyQueued = { curve: false, pumpswap: false };
    try {
      persisted = await persistTokenScan(scan);
      queued = await enqueueTokenRefresh(scan.mint);
      holderSnapshotQueued = await enqueueHolderSnapshot(scan.mint);
      historyQueued = await enqueueBuyerHistory(scan);
      if (queued || holderSnapshotQueued || historyQueued.curve || historyQueued.pumpswap) {
        after(() => dispatchWorker(request.url));
      }
    } catch (persistenceError) {
      console.error("[token/scan] persistence unavailable", { error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError) });
      scan.warnings.push("Durable indexing is temporarily unavailable; the verified live result is still shown.");
    }
    return Response.json({ ...scan, persistence: { persisted, queued, holderSnapshotQueued, historyQueued } });
  } catch (error) {
    console.error("[token/scan] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ ok: false, code: "TOKEN_SCAN_FAILED", error: error instanceof Error ? error.message : "Token scan failed." }, { status: 502 });
  }
}
