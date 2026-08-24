import type { ScanResponse, SupplySnapshot } from "@/lib/types";
import type { FomoHit } from "@/lib/fomo";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;

function configured() {
  return Boolean(url && key);
}

async function request(path: string, init: RequestInit = {}) {
  if (!url || !key) throw new Error("Supabase is not configured.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response;
}

export type StoredBuyer = {
  owner: string;
  venue: "curve" | "pumpswap" | "other_dex";
  bucket: "fomo" | "pumpfun" | "other";
  buyTxCount: number;
  firstBuyAt: string | null;
  stillHolds: boolean;
  uiAmount: number;
  pctOfSupply: number;
  fomoHandle: string | null;
};

export type StoredHolder = { owner: string; tokenAccount: string; amount: bigint };
export type StoredFomoLabel = FomoHit & { wallet: string };

type ScanJob = { id: number; job_type: string; status: string; provider_execution_id: string | null; payload: Record<string, unknown> | null };

export async function loadStoredBuyers(mint: string): Promise<StoredBuyer[]> {
  if (!configured()) return [];
  const response = await request(`token_buyers?mint=eq.${encodeURIComponent(mint)}&select=owner,venue,bucket,buy_tx_count,first_buy_at,still_holds,ui_amount_held,pct_of_supply,fomo_handle&limit=3000`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map(row => ({
    owner: String(row.owner),
    venue: row.venue === "pumpswap" || row.venue === "other_dex" ? row.venue : "curve",
    bucket: row.bucket === "fomo" || row.bucket === "pumpfun" ? row.bucket : "other",
    buyTxCount: Number(row.buy_tx_count || 0),
    firstBuyAt: typeof row.first_buy_at === "string" ? row.first_buy_at : null,
    stillHolds: Boolean(row.still_holds),
    uiAmount: Number(row.ui_amount_held || 0),
    pctOfSupply: Number(row.pct_of_supply || 0),
    fomoHandle: typeof row.fomo_handle === "string" ? row.fomo_handle : null,
  }));
}

export async function loadCurrentHolders(mint: string): Promise<StoredHolder[]> {
  if (!configured()) return [];
  const response = await request(`current_holder_balances?mint=eq.${encodeURIComponent(mint)}&select=owner,token_account,amount_raw&order=amount_raw.desc&limit=20000`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map(row => ({ owner: String(row.owner), tokenAccount: String(row.token_account), amount: BigInt(String(row.amount_raw)) }));
}

export async function loadCurrentHolderPage(mint: string, afterOwner: string | null, limit = 50): Promise<StoredHolder[]> {
  if (!configured()) return [];
  const after = afterOwner ? `&owner=gt.${encodeURIComponent(afterOwner)}` : "";
  const response = await request(`current_holder_balances?mint=eq.${encodeURIComponent(mint)}${after}&select=owner,token_account,amount_raw&order=owner.asc&limit=${limit}`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map(row => ({ owner: String(row.owner), tokenAccount: String(row.token_account), amount: BigInt(String(row.amount_raw)) }));
}

export async function loadVerifiedFomoLabels(wallets: string[]): Promise<Map<string, StoredFomoLabel>> {
  const result = new Map<string, StoredFomoLabel>();
  if (!configured()) return result;
  for (let index = 0; index < wallets.length; index += 75) {
    const group = wallets.slice(index, index + 75);
    if (!group.length) continue;
    const response = await request(`wallet_labels?wallet=in.(${group.join(",")})&select=wallet,source,handle,confidence,fomo_identity_id`);
    const rows = await response.json() as Array<Record<string, unknown>>;
    rows.forEach(row => {
      const source = row.source === "fomotags" ? "fomotags" : row.source === "fomoscan" ? "fomoscan" : null;
      if (!source) return;
      result.set(String(row.wallet), { wallet: String(row.wallet), source, handle: typeof row.handle === "string" ? row.handle : null, confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence), identityId: typeof row.fomo_identity_id === "string" ? row.fomo_identity_id : null });
    });
  }
  return result;
}

/** Reads only confirmed labels that are currently holding this mint. This keeps
 * the headline supply calculation complete after the label queue finishes
 * without issuing one URL-length-limited lookup per holder. */
export async function loadVerifiedFomoLabelsForMint(mint: string): Promise<Map<string, StoredFomoLabel>> {
  const result = new Map<string, StoredFomoLabel>();
  if (!configured()) return result;
  const response = await request(`current_verified_fomo_labels?mint=eq.${encodeURIComponent(mint)}&select=wallet,source,handle,confidence,fomo_identity_id&limit=10000`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  rows.forEach(row => {
    const source = row.source === "fomotags" ? "fomotags" : row.source === "fomoscan" ? "fomoscan" : null;
    if (!source) return;
    result.set(String(row.wallet), { wallet: String(row.wallet), source, handle: typeof row.handle === "string" ? row.handle : null, confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence), identityId: typeof row.fomo_identity_id === "string" ? row.fomo_identity_id : null });
  });
  return result;
}

export async function upsertVerifiedFomoLabels(entries: Array<{ wallet: string; hit: FomoHit }>) {
  if (!configured() || !entries.length) return;
  const now = new Date().toISOString();
  for (let index = 0; index < entries.length; index += 500) {
    await request("wallet_labels?on_conflict=wallet", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(entries.slice(index, index + 500).map(({ wallet, hit }) => ({ wallet, label: "verified_fomo", source: hit.source, handle: hit.handle, confidence: hit.confidence, fomo_identity_id: hit.identityId, verified_at: now, updated_at: now }))),
    });
  }
}

export async function replaceCurrentHolders(mint: string, holders: Array<{ owner: string; tokenAccount: string; amount: bigint }>, observedAt: string) {
  if (!configured()) return;
  await request(`current_holder_balances?mint=eq.${encodeURIComponent(mint)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  for (let index = 0; index < holders.length; index += 500) {
    await request("current_holder_balances", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(holders.slice(index, index + 500).map(holder => ({ mint, owner: holder.owner, token_account: holder.tokenAccount, amount_raw: holder.amount.toString(), observed_at: observedAt }))),
    });
  }
}

function rawPct(raw: string, total: string) {
  const denominator = BigInt(total);
  return denominator === 0n ? 0 : Number(BigInt(raw) * 10000n / denominator) / 100;
}

export async function loadSupplySnapshots(mint: string): Promise<SupplySnapshot[]> {
  if (!configured()) return [];
  const response = await request(`supply_snapshots?mint=eq.${encodeURIComponent(mint)}&select=observed_at,total_supply_raw,verified_fomo_supply_raw,pre_grad_supply_raw,post_grad_supply_raw,holder_count,fomo_checked_holder_count,holder_index_complete,price_usd,liquidity_usd&order=observed_at.asc&limit=1000`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map(row => ({
    observedAt: String(row.observed_at),
    fomoPctOfSupply: rawPct(String(row.verified_fomo_supply_raw), String(row.total_supply_raw)),
    preGradPctOfSupply: rawPct(String(row.pre_grad_supply_raw), String(row.total_supply_raw)),
    postGradPctOfSupply: rawPct(String(row.post_grad_supply_raw), String(row.total_supply_raw)),
    holderCount: Number(row.holder_count || 0),
    fomoCheckedHolderCount: Number(row.fomo_checked_holder_count || 0),
    holderIndexComplete: Boolean(row.holder_index_complete),
    priceUsd: row.price_usd === null || row.price_usd === undefined ? null : Number(row.price_usd),
    liquidityUsd: row.liquidity_usd === null || row.liquidity_usd === undefined ? null : Number(row.liquidity_usd),
  }));
}

export async function listDuneJobs(mint: string, statuses?: string[]): Promise<ScanJob[]> {
  if (!configured()) return [];
  const statusFilter = statuses?.length ? `&status=in.(${statuses.join(",")})` : "";
  const response = await request(`scan_jobs?mint=eq.${encodeURIComponent(mint)}&provider=eq.dune${statusFilter}&select=id,job_type,status,provider_execution_id,payload&order=id.asc`);
  return await response.json() as ScanJob[];
}

export async function createDuneJob(mint: string, jobType: string, payload: Record<string, unknown>) {
  if (!configured()) return null;
  const response = await request("scan_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ mint, provider: "dune", job_type: jobType, status: "queued", payload }),
  });
  const rows = await response.json() as ScanJob[];
  return rows[0] || null;
}

export async function updateScanJob(id: number, fields: Record<string, unknown>) {
  if (!configured()) return;
  await request(`scan_jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

export async function upsertDuneBuyers(mint: string, rows: Array<Record<string, unknown>>) {
  if (!configured() || !rows.length) return;
  const observedAt = new Date().toISOString();
  const payload = rows.map(row => ({
    mint,
    owner: String(row.wallet),
    venue: row.venue === "curve" || row.venue === "pumpswap" ? row.venue : "other_dex",
    bucket: row.venue === "curve" ? "pumpfun" : "other",
    buy_tx_count: Number(row.buy_tx_count || 0),
    first_buy_at: typeof row.first_buy_at === "string" ? row.first_buy_at : null,
    still_holds: false,
    ui_amount_held: 0,
    pct_of_supply: 0,
    fomo_handle: null,
    observed_at: observedAt,
  }));
  for (let index = 0; index < payload.length; index += 500) {
    await request("token_buyers?on_conflict=mint,owner,venue", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload.slice(index, index + 500)),
    });
  }
}

export async function listHeliusJobs(mint: string, statuses?: string[]): Promise<ScanJob[]> {
  if (!configured()) return [];
  const statusFilter = statuses?.length ? `&status=in.(${statuses.join(",")})` : "";
  const response = await request(`scan_jobs?mint=eq.${encodeURIComponent(mint)}&provider=eq.helius${statusFilter}&select=id,job_type,status,provider_execution_id,payload&order=id.asc`);
  return await response.json() as ScanJob[];
}

export async function createHeliusJob(mint: string, jobType: string, payload: Record<string, unknown>) {
  if (!configured()) return null;
  const response = await request("scan_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ mint, provider: "helius", job_type: jobType, status: "queued", payload }),
  });
  const rows = await response.json() as ScanJob[];
  return rows[0] || null;
}

export async function upsertHeliusCurveBuyers(mint: string, buyers: Array<{ owner: string; buyTxCount: number; firstBuyAt: string | null }>) {
  if (!configured() || !buyers.length) return;
  const observedAt = new Date().toISOString();
  const payload = buyers.map(buyer => ({
    mint,
    owner: buyer.owner,
    venue: "curve",
    bucket: "pumpfun",
    buy_tx_count: buyer.buyTxCount,
    first_buy_at: buyer.firstBuyAt,
    still_holds: false,
    ui_amount_held: 0,
    pct_of_supply: 0,
    fomo_handle: null,
    observed_at: observedAt,
  }));
  for (let index = 0; index < payload.length; index += 500) {
    await request("token_buyers?on_conflict=mint,owner,venue", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload.slice(index, index + 500)),
    });
  }
}

export async function upsertTokenTrades(mint: string, events: Array<{ signature: string; owner: string; at: string | null }>, venue: "curve" | "pumpswap" | "other_dex", phase: "pre_grad" | "post_grad") {
  if (!configured() || !events.length) return;
  const payload = events.filter(event => Boolean(event.signature)).map(event => ({ mint, signature: event.signature, owner: event.owner, block_time: event.at, venue, side: "buy", phase }));
  for (let index = 0; index < payload.length; index += 500) {
    await request("token_trades?on_conflict=mint,signature,owner", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload.slice(index, index + 500)),
    });
  }
}

export async function claimActiveJobMints(limit = 2): Promise<string[]> {
  if (!configured()) return [];
  const response = await request("rpc/claim_scan_jobs", {
    method: "POST",
    body: JSON.stringify({ job_limit: limit }),
  });
  const rows = await response.json() as Array<{ mint?: string }>;
  return [...new Set(rows.map(row => row.mint).filter((mint): mint is string => Boolean(mint)))];
}

/**
 * Persist the useful output of a scan without letting database availability
 * prevent an on-chain result from reaching the user.
 */
export async function persistScan(scan: ScanResponse): Promise<void> {
  if (!configured()) return;
  const now = scan.updatedAt;
  await request("token_scans?on_conflict=mint", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      mint: scan.mint,
      token_name: scan.token.name,
      token_symbol: scan.token.symbol,
      is_pumpfun: scan.token.isPumpFun,
      graduated: scan.token.graduated,
      creator: scan.addresses.creator,
      bonding_curve: scan.addresses.bondingCurve,
      scan_data: scan,
      last_scanned_at: now,
      updated_at: now,
    }),
  });

  // Lifecycle is intentionally separate from the mutable scan payload so
  // downstream jobs and the chart can use a stable graduation marker.
  try {
    await request("token_lifecycle?on_conflict=mint", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        mint: scan.mint,
        lifecycle_status: scan.token.graduated ? "graduated" : scan.token.isPumpFun ? "on_curve" : "not_pumpfun",
        graduation_signature: scan.lifecycle.graduation?.signature || null,
        graduation_at: scan.lifecycle.graduation?.at || null,
        graduation_buyer: scan.lifecycle.graduation?.buyer || null,
        graduation_verification: scan.lifecycle.graduation?.verification || null,
        updated_at: now,
      }),
    });
  } catch {
    // Kept optional during staged migrations, like the analytics snapshots.
  }

  const holders = scan.holders.map((holder) => ({
    mint: scan.mint,
    owner: holder.owner,
    token_account: holder.tokenAccount,
    rank: holder.rank,
    ui_amount: holder.uiAmount,
    pct_of_supply: holder.pctOfSupply,
    label: holder.label,
    fomo_handle: holder.fomoHandle,
    observed_at: now,
  }));
  if (holders.length) {
    await request("holder_snapshots?on_conflict=mint,owner,observed_at", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(holders),
    });
  }

  const buyers = scan.pumpfunBuyers.wallets.map((buyer) => ({
    mint: scan.mint,
    owner: buyer.owner,
    venue: buyer.venue,
    bucket: buyer.bucket,
    buy_tx_count: buyer.buyTxCount,
    first_buy_at: buyer.firstBuyAt,
    still_holds: buyer.stillHolds,
    ui_amount_held: buyer.uiAmount,
    pct_of_supply: buyer.pctOfSupply,
    fomo_handle: buyer.fomoHandle,
    observed_at: now,
  }));
  if (buyers.length) {
    await request("token_buyers?on_conflict=mint,owner,venue", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(buyers),
    });
  }

  // Snapshots are optional until the matching migration has been applied. A
  // missing analytics table must never make a live scan fail.
  try {
    await request("supply_snapshots", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        mint: scan.mint,
        observed_at: now,
        total_supply_raw: scan.token.supplyRaw,
        verified_fomo_supply_raw: scan.analytics.fomoSupplyRaw,
        pre_grad_supply_raw: scan.analytics.preGradSupplyRaw,
        post_grad_supply_raw: scan.analytics.postGradSupplyRaw,
        holder_count: scan.split.scannedHolderCount,
        fomo_checked_holder_count: scan.split.fomoCheckedHolderCount,
        holder_index_complete: scan.analytics.holderIndexComplete,
        price_usd: scan.token.priceUsd,
        liquidity_usd: scan.token.liquidityUsd,
      }),
    });
  } catch {
    // The first deployment can run before the chart migration is installed.
  }
}

export async function supabaseReady(): Promise<boolean> {
  if (!configured()) return false;
  try {
    await request("token_scans?select=mint&limit=1", { method: "GET" });
    return true;
  } catch {
    return false;
  }
}
