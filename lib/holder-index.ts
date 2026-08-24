import { PublicKey } from "@solana/web3.js";
import { connection, rpcRetry } from "@/lib/solana";
import { createHeliusJob, listHeliusJobs, replaceCurrentHolders, updateScanJob } from "@/lib/supabase";

export type IndexedHolder = { owner: string; tokenAccount: string; amount: bigint };

export type HolderIndexProgress = {
  state: string;
  holderCount: number;
  tokenAccountCount: number;
  observedAt: string | null;
};

const REFRESH_AFTER_MS = 5 * 60 * 1000;

function payloadValue(payload: Record<string, unknown> | null, key: string) {
  return payload?.[key];
}

/** Queue a complete owner aggregation. This is deliberately separate from the
 * fast `getTokenLargestAccounts` scan, which is only a responsiveness fallback. */
export async function enqueueHolderIndex(mint: string) {
  const jobs = await listHeliusJobs(mint);
  const latest = [...jobs].reverse().find(job => job.job_type === "holder_index");
  if (latest && (latest.status === "queued" || latest.status === "running")) return false;
  const observedAt = typeof payloadValue(latest?.payload || null, "observed_at") === "string" ? String(payloadValue(latest?.payload || null, "observed_at")) : null;
  if (latest?.status === "completed" && observedAt && Date.now() - Date.parse(observedAt) < REFRESH_AFTER_MS) return false;
  const mintInfo = await rpcRetry(() => connection().getAccountInfo(new PublicKey(mint)));
  if (!mintInfo) throw new Error("Mint account was not found while creating its holder index.");
  return Boolean(await createHeliusJob(mint, "holder_index", { token_program: mintInfo.owner.toBase58(), pages: 0, holder_count: 0, token_account_count: 0 }));
}

/** `getProgramAccounts` is one complete mint snapshot. It is only used from
 * the durable worker and the result is aggregated before persistence. */
export async function indexAllHolders(mint: string, tokenProgram: string): Promise<IndexedHolder[]> {
  const program = new PublicKey(tokenProgram);
  const mintKey = new PublicKey(mint);
  const accounts = await rpcRetry(() => connection().getProgramAccounts(program, {
    commitment: "confirmed",
    dataSlice: { offset: 0, length: 72 },
    filters: [{ memcmp: { offset: 0, bytes: mintKey.toBase58() } }],
  }));
  const byOwner = new Map<string, IndexedHolder>();
  for (const account of accounts) {
    const data = account.account.data;
    if (data.length < 72) continue;
    const owner = new PublicKey(data.subarray(32, 64)).toBase58();
    const amount = data.readBigUInt64LE(64);
    if (amount === 0n) continue;
    const previous = byOwner.get(owner);
    byOwner.set(owner, { owner, tokenAccount: previous?.tokenAccount || account.pubkey.toBase58(), amount: (previous?.amount || 0n) + amount });
  }
  return [...byOwner.values()].sort((a, b) => a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1);
}

/** Processes one full holder job. A failed provider response preserves the
 * last known complete snapshot instead of publishing a partial holder set. */
export async function advanceHolderJobs(mint: string) {
  const job = [...await listHeliusJobs(mint, ["queued", "running"])].reverse().find(item => item.job_type === "holder_index");
  if (!job) return false;
  const tokenProgram = typeof payloadValue(job.payload, "token_program") === "string" ? String(payloadValue(job.payload, "token_program")) : null;
  if (!tokenProgram) {
    await updateScanJob(job.id, { status: "failed", error: "Holder index is missing its token program." });
    return true;
  }
  try {
    await updateScanJob(job.id, { status: "running" });
    const holders = await indexAllHolders(mint, tokenProgram);
    const observedAt = new Date().toISOString();
    await replaceCurrentHolders(mint, holders, observedAt);
    await updateScanJob(job.id, { status: "completed", payload: { token_program: tokenProgram, pages: 1, holder_count: holders.length, token_account_count: holders.reduce((count) => count + 1, 0), observed_at: observedAt } });
    return true;
  } catch (error) {
    await updateScanJob(job.id, { status: "failed", error: error instanceof Error ? error.message : "Holder index failed" });
    return true;
  }
}

export async function holderIndexProgress(mint: string): Promise<HolderIndexProgress> {
  const job = [...await listHeliusJobs(mint)].reverse().find(item => item.job_type === "holder_index");
  const payload = job?.payload || null;
  return {
    state: job?.status || "not_started",
    holderCount: Number(payloadValue(payload, "holder_count") || 0),
    tokenAccountCount: Number(payloadValue(payload, "token_account_count") || 0),
    observedAt: typeof payloadValue(payload, "observed_at") === "string" ? String(payloadValue(payload, "observed_at")) : null,
  };
}
