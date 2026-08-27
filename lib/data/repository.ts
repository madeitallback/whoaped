import type { TokenScan } from "../token-intel/types";
import type { VerifiedBuyEvent } from "../token-intel/buyers";
import type { FomoIdentity } from "../token-intel/types";
import type { TokenSocialActor, TokenThesisEvidence } from "./contracts";
import type { ThesisCaptureInput } from "../thesis-evidence";
import type { PlatformProfileRecord } from "../platforms/types";
import { isSupabaseConfigured, supabaseRequest } from "./supabase";

export type ClaimedJob = {
  id: number;
  job_type: "token_refresh_v1" | "holder_snapshot_v1" | "curve_history_v1" | "pumpswap_history_v1";
  resource_key: string;
  attempt_count: number;
  payload: Record<string, unknown>;
};

const preferMerge = { Prefer: "resolution=merge-duplicates,return=minimal" };

export async function persistTokenScan(scan: TokenScan) {
  if (!isSupabaseConfigured()) return false;
  await supabaseRequest("tokens?on_conflict=mint", {
    method: "POST",
    headers: preferMerge,
    body: JSON.stringify({
      mint: scan.mint,
      name: scan.token.name,
      symbol: scan.token.symbol,
      image_url: scan.token.image,
      decimals: scan.token.decimals,
      supply_ui: scan.token.supplyUi,
      is_pump_fun: scan.token.isPumpFun,
      graduated: scan.token.graduated,
      bonding_curve: scan.addresses.bondingCurve,
      creator_wallet: scan.addresses.creator,
      price_usd: scan.token.priceUsd,
      liquidity_usd: scan.token.liquidityUsd,
      coverage: scan.coverage,
      observed_at: scan.updatedAt,
      updated_at: scan.updatedAt,
    }),
  });
  if (scan.holders.length) {
    await supabaseRequest("token_positions?on_conflict=mint,wallet", {
      method: "POST",
      headers: preferMerge,
      body: JSON.stringify(scan.holders.map((holder) => ({
        mint: scan.mint,
        wallet: holder.owner,
        token_account: holder.tokenAccount,
        balance_ui: holder.uiAmount,
        pct_of_supply: holder.pctOfSupply,
        current_label: holder.label,
        coverage_state: scan.coverage.holderState,
        observed_at: scan.updatedAt,
        updated_at: scan.updatedAt,
      }))),
    });
  }
  return true;
}

export async function enqueueTokenRefresh(mint: string) {
  if (!isSupabaseConfigured()) return false;
  const refreshBucket = Math.floor(Date.now() / 300_000);
  await supabaseRequest("ingestion_jobs?on_conflict=idempotency_key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      job_type: "token_refresh_v1",
      resource_key: mint,
      idempotency_key: `token_refresh_v1:${mint}:${refreshBucket}`,
      status: "queued",
      payload: { mint, schema_version: 1 },
    }),
  });
  return true;
}

export async function enqueueHolderSnapshot(mint: string) {
  if (!isSupabaseConfigured()) return false;
  const refreshBucket = Math.floor(Date.now() / 300_000);
  await supabaseRequest("ingestion_jobs?on_conflict=idempotency_key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      job_type: "holder_snapshot_v1",
      resource_key: mint,
      idempotency_key: `holder_snapshot_v1:${mint}:${refreshBucket}`,
      status: "queued",
      payload: { mint, schema_version: 1 },
    }),
  });
  return true;
}

async function enqueueHistoryJob(jobType: "curve_history_v1" | "pumpswap_history_v1", mint: string, payload: Record<string, unknown>) {
  if (!isSupabaseConfigured()) return false;
  await supabaseRequest("ingestion_jobs?on_conflict=idempotency_key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ job_type: jobType, resource_key: mint, idempotency_key: `${jobType}:${mint}:decoder-1`, status: "queued", payload: { ...payload, mint, cursor: null, pages: 0, scanned_signatures: 0, buyers_found: 0, decoder_version: 1 } }),
  });
  return true;
}

export async function enqueueBuyerHistory(scan: TokenScan) {
  const curve = scan.addresses.bondingCurve
    ? await enqueueHistoryJob("curve_history_v1", scan.mint, { curve: scan.addresses.bondingCurve })
    : false;
  const pumpswap = scan.token.graduated
    ? await enqueueHistoryJob("pumpswap_history_v1", scan.mint, {})
    : false;
  return { curve, pumpswap };
}

export async function replaceTokenPositions(mint: string, observedAt: string, positions: Array<{ wallet: string; tokenAccount: string; balanceUi: number; pctOfSupply: number; label: string }>) {
  const response = await supabaseRequest("rpc/replace_token_positions", {
    method: "POST",
    body: JSON.stringify({
      position_mint: mint,
      snapshot_observed_at: observedAt,
      positions: positions.map((position) => ({ wallet: position.wallet, token_account: position.tokenAccount, balance_ui: position.balanceUi, pct_of_supply: position.pctOfSupply, current_label: position.label })),
    }),
  });
  return Number(await response.json());
}

export async function upsertVerifiedBuyEvents(mint: string, events: VerifiedBuyEvent[]) {
  if (!events.length) return;
  await supabaseRequest("token_buy_events?on_conflict=mint,signature,wallet,venue", {
    method: "POST",
    headers: preferMerge,
    body: JSON.stringify(events.map((event) => ({ mint, signature: event.signature, wallet: event.owner, venue: event.venue, phase: event.phase, occurred_at: event.at, decoder_version: 1 }))),
  });
}

export async function persistFomoIdentities(mint: string, identities: Map<string, FomoIdentity>, holderWallets: Set<string>, buyerWallets: Set<string>) {
  if (!isSupabaseConfigured() || !identities.size) return false;
  const observedAt = new Date().toISOString();
  const payload = [...identities.entries()].flatMap(([wallet, identity]) => {
    const platformId = identity.identityId || identity.handle;
    if (!platformId) return [];
    const isHolder = holderWallets.has(wallet);
    const isBuyer = buyerWallets.has(wallet);
    return [{
      wallet,
      platform_profile_id: platformId,
      handle: identity.handle,
      profile_url: identity.handle ? `https://fomo.family/profile/${encodeURIComponent(identity.handle)}` : "https://fomo.family/",
      source: identity.source,
      relationship: isHolder && isBuyer ? "both" : isHolder ? "holder" : isBuyer ? "buyer" : "observed",
      observed_at: observedAt,
    }];
  });
  if (!payload.length) return false;
  await supabaseRequest("rpc/upsert_fomo_identity_batch", { method: "POST", body: JSON.stringify({ identity_mint: mint, identities: payload }) });
  return true;
}

export async function persistPumpIdentities(mint: string, profiles: Map<string, PlatformProfileRecord>, holderWallets: Set<string>, buyerWallets: Set<string>) {
  if (!isSupabaseConfigured() || !profiles.size) return false;
  const observedAt = new Date().toISOString();
  const identities = [...profiles.entries()].map(([wallet, profile]) => ({
    wallet,
    platform_profile_id: profile.platformProfileId,
    handle: profile.handle,
    display_name: profile.displayName,
    profile_url: profile.profileUrl,
    visible_follower_count: profile.visibleFollowerCount,
    relationship: holderWallets.has(wallet) && buyerWallets.has(wallet) ? "both" : holderWallets.has(wallet) ? "holder" : buyerWallets.has(wallet) ? "buyer" : "observed",
    observed_at: observedAt,
  }));
  await supabaseRequest("rpc/upsert_pump_identity_batch", { method: "POST", body: JSON.stringify({ identity_mint: mint, identities }) });
  return true;
}

type TokenSocialActorRow = {
  profile_id: string;
  wallet: string;
  relationship: TokenSocialActor["relationship"];
  confidence: TokenSocialActor["confidence"];
  observed_at: string;
  social_profiles: {
    platform: TokenSocialActor["platform"];
    platform_profile_id: string;
    handle: string | null;
    display_name: string | null;
    profile_url: string;
  } | Array<{
    platform: TokenSocialActor["platform"];
    platform_profile_id: string;
    handle: string | null;
    display_name: string | null;
    profile_url: string;
  }> | null;
};

export async function readTokenSocialActors(mint: string): Promise<TokenSocialActor[]> {
  if (!isSupabaseConfigured()) return [];
  const select = "profile_id,wallet,relationship,confidence,observed_at,social_profiles!inner(platform,platform_profile_id,handle,display_name,profile_url)";
  const response = await supabaseRequest(`token_social_actors?mint=eq.${encodeURIComponent(mint)}&select=${encodeURIComponent(select)}&order=observed_at.desc`);
  const rows = await response.json() as TokenSocialActorRow[];
  const actors = new Map<string, TokenSocialActor>();
  for (const row of rows) {
    const profile = Array.isArray(row.social_profiles) ? row.social_profiles[0] : row.social_profiles;
    if (!profile) continue;
    const key = `${row.profile_id}:${row.wallet}`;
    actors.set(key, {
      profileId: row.profile_id,
      platform: profile.platform,
      platformProfileId: profile.platform_profile_id,
      handle: profile.handle,
      displayName: profile.display_name,
      profileUrl: profile.profile_url,
      wallet: row.wallet,
      relationship: row.relationship,
      confidence: row.confidence,
      observedAt: row.observed_at,
    });
  }
  return [...actors.values()];
}

export async function captureThesisEvidence(input: ThesisCaptureInput, contentHash: string) {
  const response = await supabaseRequest("rpc/capture_thesis_evidence", {
    method: "POST",
    body: JSON.stringify({
      evidence_mint: input.mint,
      evidence_platform: input.platform,
      evidence_platform_profile_id: input.platformProfileId,
      evidence_handle: input.handle,
      evidence_display_name: input.displayName,
      evidence_profile_url: input.profileUrl,
      evidence_source_url: input.sourceUrl,
      evidence_source_text: input.sourceText,
      evidence_published_at: input.publishedAt,
      evidence_captured_at: new Date().toISOString(),
      evidence_content_hash: contentHash,
      evidence_relevance: input.relevance,
    }),
  });
  return await response.json() as string;
}

type ThesisRow = {
  id: string;
  profile_id: string;
  mint: string;
  source_url: string;
  source_text: string;
  published_at: string | null;
  captured_at: string;
  content_hash: string;
  relevance: TokenThesisEvidence["relevance"];
  social_profiles: TokenSocialActorRow["social_profiles"];
};

export async function readTokenTheses(mint: string): Promise<TokenThesisEvidence[]> {
  if (!isSupabaseConfigured()) return [];
  const select = "id,profile_id,mint,source_url,source_text,published_at,captured_at,content_hash,relevance,social_profiles!inner(platform,platform_profile_id,handle,display_name,profile_url)";
  const response = await supabaseRequest(`thesis_evidence?mint=eq.${encodeURIComponent(mint)}&deleted_at=is.null&select=${encodeURIComponent(select)}&order=published_at.desc.nullslast,captured_at.desc`);
  const rows = await response.json() as ThesisRow[];
  return rows.flatMap((row) => {
    const profile = Array.isArray(row.social_profiles) ? row.social_profiles[0] : row.social_profiles;
    if (!profile) return [];
    return [{
      id: row.id,
      profileId: row.profile_id,
      mint: row.mint,
      sourceUrl: row.source_url,
      sourceText: row.source_text,
      publishedAt: row.published_at,
      capturedAt: row.captured_at,
      contentHash: row.content_hash,
      relevance: row.relevance,
      platform: profile.platform,
      platformProfileId: profile.platform_profile_id,
      handle: profile.handle,
      displayName: profile.display_name,
      profileUrl: profile.profile_url,
    } satisfies TokenThesisEvidence];
  });
}

export async function claimIngestionJobs(limit = 2): Promise<ClaimedJob[]> {
  const response = await supabaseRequest("rpc/claim_ingestion_jobs", {
    method: "POST",
    body: JSON.stringify({ job_limit: Math.max(1, Math.min(limit, 4)), lease_seconds: 120 }),
  });
  return await response.json() as ClaimedJob[];
}

export async function completeIngestionJob(id: number, result: Record<string, unknown>) {
  await supabaseRequest(`ingestion_jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "completed", result, error: null, locked_until: null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

export async function continueIngestionJob(id: number, payload: Record<string, unknown>) {
  await supabaseRequest(`ingestion_jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "queued", payload, attempt_count: 0, locked_until: null, updated_at: new Date().toISOString() }),
  });
}

export async function failIngestionJob(id: number, error: string) {
  await supabaseRequest(`ingestion_jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "failed", error: error.slice(0, 1000), locked_until: null, updated_at: new Date().toISOString() }),
  });
}
