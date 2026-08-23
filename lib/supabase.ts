import type { ScanResponse } from "@/lib/types";

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
    await request("holder_snapshots?on_conflict=mint,owner", {
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
