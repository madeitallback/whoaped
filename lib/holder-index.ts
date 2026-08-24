import { PublicKey } from "@solana/web3.js";
import { connection, hasDedicatedRpc, rpcRetry, rpcUrl } from "@/lib/solana";
import { createHeliusJob, listHeliusJobs, replaceCurrentHolders, updateScanJob } from "@/lib/supabase";

export type IndexedHolder = { owner: string; tokenAccount: string; amount: bigint };
export type HolderIndexResult = { holders: IndexedHolder[]; tokenAccountCount: number };

export type HolderIndexProgress = {
  state: string;
  holderCount: number;
  tokenAccountCount: number;
  observedAt: string | null;
};

const REFRESH_AFTER_MS = 5 * 60 * 1000;
const HOLDER_PAGE_SIZE = 1_000;

type ProgramAccountPage = {
  accounts: Array<{ pubkey: string; account: { data: [string, "base64"] } }>;
  paginationKey: string | null;
};

function payloadValue(payload: Record<string, unknown> | null, key: string) {
  return payload?.[key];
}

async function getProgramAccountsPage(program: string, mint: string, paginationKey: string | null): Promise<ProgramAccountPage> {
  const response = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `holders-${paginationKey || "first"}`,
      method: "getProgramAccountsV2",
      params: [program, {
        commitment: "confirmed",
        encoding: "base64",
        dataSlice: { offset: 0, length: 72 },
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
        limit: HOLDER_PAGE_SIZE,
        ...(paginationKey ? { paginationKey } : {}),
      }],
    }),
    cache: "no-store",
  });
  const body = await response.json() as { error?: { message?: string }; result?: ProgramAccountPage };
  if (!response.ok || body.error || !body.result) throw new Error(body.error?.message || `Holder RPC returned ${response.status}.`);
  return body.result;
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
export async function indexAllHolders(mint: string, tokenProgram: string): Promise<HolderIndexResult> {
  if (!hasDedicatedRpc() || !rpcUrl().includes("helius")) throw new Error("Complete holder indexing requires a Helius RPC URL or API key.");
  const byOwner = new Map<string, IndexedHolder>();
  let paginationKey: string | null = null;
  let tokenAccountCount = 0;
  const seenCursors = new Set<string>();
  do {
    const page = await rpcRetry(() => getProgramAccountsPage(tokenProgram, mint, paginationKey));
    tokenAccountCount += page.accounts.length;
    for (const account of page.accounts) {
      const data = Buffer.from(account.account.data[0], "base64");
      if (data.length < 72) continue;
      const owner = new PublicKey(data.subarray(32, 64)).toBase58();
      const amount = data.readBigUInt64LE(64);
      if (amount === 0n) continue;
      const previous = byOwner.get(owner);
      byOwner.set(owner, { owner, tokenAccount: previous?.tokenAccount || account.pubkey, amount: (previous?.amount || 0n) + amount });
    }
    paginationKey = page.paginationKey;
    if (paginationKey && seenCursors.has(paginationKey)) throw new Error("Holder RPC returned a repeated pagination cursor.");
    if (paginationKey) seenCursors.add(paginationKey);
  } while (paginationKey);
  return { holders: [...byOwner.values()].sort((a, b) => a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1), tokenAccountCount };
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
    const { holders, tokenAccountCount } = await indexAllHolders(mint, tokenProgram);
    const observedAt = new Date().toISOString();
    await replaceCurrentHolders(mint, holders, observedAt);
    await updateScanJob(job.id, { status: "completed", payload: { token_program: tokenProgram, pages: 1, holder_count: holders.length, token_account_count: tokenAccountCount, observed_at: observedAt } });
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
