import bs58 from "bs58";
import { PublicKey, type Connection } from "@solana/web3.js";
import { PUMPSWAP_PROGRAM, connection, hasDedicatedRpc, rpcRetry } from "./solana";
import { createHeliusJob, listHeliusJobs, updateScanJob, upsertHeliusPumpSwapBuyers, upsertTokenTrades } from "./supabase";
import type { CurveBuyEvent } from "./buyers";

type SwapBuyer = { owner: string; buyTxCount: number; firstBuyAt: string | null };
type EnhancedInstruction = { programId?: string; accounts?: string[]; data?: string };
type EnhancedTransaction = { signature?: string; timestamp?: number; instructions?: EnhancedInstruction[] };
type Payload = { cursor?: string | null; pages?: number; scanned_signatures?: number; buyers_found?: number };

// Official PumpSwap IDL: `buy` and `buy_exact_quote_in` respectively.
const BUY_DISCRIMINATORS = new Set(["66063d1201daebea", "c62e1552b4d9e870"]);

function discriminator(data: string) { return Buffer.from(bs58.decode(data)).subarray(0, 8).toString("hex"); }

/** Validates the official PumpSwap account ordering: pool[0], user[1], base
 * mint[3]. A transaction merely touching the AMM is never counted as a buy. */
export function pumpSwapBuyOwner(instruction: EnhancedInstruction, mint: string) {
  if (instruction.programId !== PUMPSWAP_PROGRAM || !instruction.data || !instruction.accounts) return null;
  try {
    return BUY_DISCRIMINATORS.has(discriminator(instruction.data)) && instruction.accounts[1] && instruction.accounts[3] === mint ? instruction.accounts[1] : null;
  } catch { return null; }
}

async function findPage(connection: Connection, mint: PublicKey, before?: string | null, cap = 100) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("Helius Enhanced Transactions requires HELIUS_API_KEY.");
  const signatures = await rpcRetry(() => connection.getSignaturesForAddress(mint, { limit: cap, ...(before ? { before } : {}) }));
  const byOwner = new Map<string, SwapBuyer>();
  const events = new Map<string, CurveBuyEvent>();
  const order = new Map(signatures.map((item, index) => [item.signature, index]));
  let latestBuy: CurveBuyEvent | null = null;
  for (let index = 0; index < signatures.length; index += 100) {
    const batch = signatures.slice(index, index + 100);
    const response = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/json", "user-agent": "whoaped-server/0.1" }, body: JSON.stringify({ transactions: batch.map(item => item.signature) }), cache: "no-store" });
    if (!response.ok) throw new Error(`Helius enhanced transactions: ${response.status}`);
    const txs = await response.json() as EnhancedTransaction[];
    const times = new Map(batch.map(item => [item.signature, item.blockTime || null]));
    for (const tx of txs) for (const instruction of tx.instructions || []) {
      const owner = pumpSwapBuyOwner(instruction, mint.toBase58());
      const signature = tx.signature || "";
      if (!owner || !signature) continue;
      const seconds = tx.timestamp || times.get(signature) || null;
      const at = seconds ? new Date(seconds * 1000).toISOString() : null;
      const event = { signature, owner, at };
      events.set(`${signature}:${owner}`, event);
      if (!latestBuy || (order.get(signature) ?? Number.MAX_SAFE_INTEGER) < (order.get(latestBuy.signature) ?? Number.MAX_SAFE_INTEGER)) latestBuy = event;
      const previous = byOwner.get(owner);
      byOwner.set(owner, { owner, buyTxCount: (previous?.buyTxCount || 0) + 1, firstBuyAt: previous?.firstBuyAt || at });
    }
  }
  return { buyers: [...byOwner.values()], events: [...events.values()], latestBuy, nextCursor: signatures.length >= cap ? signatures.at(-1)?.signature || null : null, scannedSignatures: signatures.length };
}

export type PostGradIndexProgress = { state: string; pages: number; scannedSignatures: number; buyersFound: number };

export async function enqueuePumpSwapIndex(mint: string, graduated: boolean) {
  if (!graduated || !hasDedicatedRpc() || !process.env.HELIUS_API_KEY) return false;
  const jobs = await listHeliusJobs(mint);
  if (jobs.some(job => job.job_type === "post_grad_history" && job.status !== "failed" && job.status !== "cancelled")) return false;
  return Boolean(await createHeliusJob(mint, "post_grad_history", { cursor: null, pages: 0, scanned_signatures: 0, buyers_found: 0 }));
}

export async function advancePumpSwapJobs(mint: string) {
  const job = [...await listHeliusJobs(mint, ["queued", "running"])].reverse().find(item => item.job_type === "post_grad_history");
  if (!job) return false;
  const payload = (job.payload || {}) as Payload;
  try {
    const page = await findPage(connection(), new PublicKey(mint), payload.cursor);
    await upsertHeliusPumpSwapBuyers(mint, page.buyers);
    try { await upsertTokenTrades(mint, page.events, "pumpswap", "post_grad"); } catch { /* staged token_trades migration */ }
    await updateScanJob(job.id, { status: page.nextCursor ? "running" : "completed", payload: { ...payload, cursor: page.nextCursor, pages: (payload.pages || 0) + 1, scanned_signatures: (payload.scanned_signatures || 0) + page.scannedSignatures, buyers_found: (payload.buyers_found || 0) + page.buyers.length }, result: page.nextCursor ? null : { complete: true } });
    return true;
  } catch (error) {
    await updateScanJob(job.id, { status: "failed", error: error instanceof Error ? error.message : "PumpSwap index failed" });
    return true;
  }
}

export async function postGradIndexProgress(mint: string): Promise<PostGradIndexProgress> {
  const job = [...await listHeliusJobs(mint)].reverse().find(item => item.job_type === "post_grad_history" && item.status !== "cancelled");
  const payload = (job?.payload || {}) as Payload;
  return { state: job?.status || "not_started", pages: Number(payload.pages || 0), scannedSignatures: Number(payload.scanned_signatures || 0), buyersFound: Number(payload.buyers_found || 0) };
}
