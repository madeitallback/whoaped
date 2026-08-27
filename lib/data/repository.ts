import type { TokenScan } from "../token-intel/types";
import type { VerifiedTradeEvent } from "../token-intel/buyers";
import type { FomoIdentity } from "../token-intel/types";
import type { FomoLeaderboardObservation, TokenSocialActor, TokenThesisEvidence, TokenTradeActivityEvent, TokenWalletActivity } from "./contracts";
import type { ThesisCaptureInput } from "../thesis-evidence";
import type { PlatformFollowerRecord, PlatformProfileRecord } from "../platforms/types";
import type { FollowerEdgeMetrics } from "../follower-edge";
import type { FomoTokenThesis } from "../token-intel/fomo-theses";
import { positionStatus } from "../token-intel/activity";
import type { ResolvedFomoHolderCapture } from "../token-intel/fomo-holder-capture";
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
    body: JSON.stringify({ job_type: jobType, resource_key: mint, idempotency_key: `${jobType}:${mint}:decoder-2`, status: "queued", payload: { ...payload, mint, cursor: null, pages: 0, scanned_signatures: 0, events_found: 0, decoder_version: 2 } }),
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

export async function upsertVerifiedTradeEvents(mint: string, events: VerifiedTradeEvent[]) {
  if (!events.length) return;
  await supabaseRequest("token_trade_events?on_conflict=mint,signature,wallet,venue,side", {
    method: "POST",
    headers: preferMerge,
    body: JSON.stringify(events.map((event) => ({ mint, signature: event.signature, wallet: event.owner, venue: event.venue, phase: event.phase, side: event.side, quantity_raw: event.quantityRaw, occurred_at: event.at, decoder_version: 2, decoder_variant: event.decoderVariant }))),
  });
  await supabaseRequest("rpc/reconcile_token_trade_activity", { method: "POST", body: JSON.stringify({ activity_mint: mint }) });
}

type ActivityPositionRow = { wallet: string; balance_ui: number | string; pct_of_supply: number | string | null; first_buy_at: string | null; last_buy_at: string | null; last_sell_at: string | null; buy_tx_count: number; sell_tx_count: number; observed_at: string };
type ActivityEventRow = { signature: string; wallet: string; venue: TokenTradeActivityEvent["venue"]; phase: TokenTradeActivityEvent["phase"]; side: TokenTradeActivityEvent["side"]; quantity_raw: string | null; occurred_at: string | null };

export async function readTokenActivity(mint: string) {
  if (!isSupabaseConfigured()) return { positions: [] as TokenWalletActivity[], events: [] as TokenTradeActivityEvent[] };
  const [positionResponse, eventResponse] = await Promise.all([
    supabaseRequest(`token_positions?mint=eq.${encodeURIComponent(mint)}&or=(balance_ui.gt.0,buy_tx_count.gt.0,sell_tx_count.gt.0)&select=wallet,balance_ui,pct_of_supply,first_buy_at,last_buy_at,last_sell_at,buy_tx_count,sell_tx_count,observed_at&order=balance_ui.desc&limit=2000`),
    supabaseRequest(`token_trade_events?mint=eq.${encodeURIComponent(mint)}&select=signature,wallet,venue,phase,side,quantity_raw,occurred_at&order=occurred_at.desc.nullslast&limit=200`),
  ]);
  const rows = await positionResponse.json() as ActivityPositionRow[];
  const eventRows = await eventResponse.json() as ActivityEventRow[];
  return {
    positions: rows.map((row) => {
      const balanceUi = Number(row.balance_ui);
      const status = positionStatus(balanceUi, row.sell_tx_count);
      return { wallet: row.wallet, balanceUi, pctOfSupply: Number(row.pct_of_supply || 0), firstBuyAt: row.first_buy_at, lastBuyAt: row.last_buy_at, lastSellAt: row.last_sell_at, buyTxCount: row.buy_tx_count, sellTxCount: row.sell_tx_count, status, observedAt: row.observed_at };
    }),
    events: eventRows.map((row) => ({ signature: row.signature, wallet: row.wallet, venue: row.venue, phase: row.phase, side: row.side, quantityRaw: row.quantity_raw, occurredAt: row.occurred_at })),
  };
}

export async function persistFomoHolderCaptures(mint: string, sourceUrl: string, captures: ResolvedFomoHolderCapture[]) {
  if (!isSupabaseConfigured() || !captures.length) return 0;
  const observedAt = new Date().toISOString();
  const response = await supabaseRequest("rpc/capture_fomo_token_holder_batch", {
    method: "POST",
    body: JSON.stringify({
      capture_mint: mint,
      capture_source_url: sourceUrl,
      capture_observed_at: observedAt,
      capture_items: captures.map((capture) => ({
        handle: capture.handle,
        normalized_handle: capture.normalizedHandle,
        amount_text: capture.amountText,
        avatar_url: capture.avatarUrl ?? null,
        thesis_text: capture.thesisText ?? null,
        amount_low_ui: capture.amountLowUi,
        amount_high_ui: capture.amountHighUi,
        hold_time_text: capture.holdTimeText ?? null,
        value_usd: capture.valueUsd ?? null,
        pnl_usd: capture.pnlUsd ?? null,
        roi_pct: capture.roiPct ?? null,
        wallet: capture.wallet,
        confidence: capture.confidence,
        resolution_method: capture.resolutionMethod,
        trade_events: capture.trades ?? [],
        resolution_evidence: capture.resolutionEvidence,
      })),
    }),
  });
  return Number(await response.json());
}

export type FomoLeaderboardCaptureItem = Omit<FomoLeaderboardObservation, "window" | "sourceUrl" | "capturedAt">;

export async function persistFomoFirstPartyLeaderboard(window: FomoLeaderboardObservation["window"], sourceUrl: string, rows: FomoLeaderboardCaptureItem[]) {
  if (!isSupabaseConfigured() || !rows.length) return 0;
  const capturedAt = new Date().toISOString();
  const response = await supabaseRequest("rpc/capture_fomo_first_party_leaderboard", {
    method: "POST",
    body: JSON.stringify({
      capture_window: window,
      capture_source_url: sourceUrl,
      capture_observed_at: capturedAt,
      capture_items: rows.map((row) => ({
        normalized_handle: row.normalizedHandle,
        handle: row.handle,
        display_name: row.displayName,
        avatar_url: row.avatarUrl,
        platform_rank: row.platformRank,
        realized_pnl_usd: row.realizedPnlUsd,
        volume_usd: row.volumeUsd,
        trade_count: row.tradeCount,
        follower_count: row.followerCount,
      })),
    }),
  });
  return { affected: Number(await response.json()), capturedAt };
}

type FomoCollectorClaimRow = { claim_token: string; sealed_session: string };
type FomoCollectorStatusRow = {
  status: "setup_required" | "ready" | "running" | "error";
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  last_counts: Record<string, number>;
  updated_at: string;
};

export async function setFomoCollectorSession(sealedSession: string) {
  await supabaseRequest("rpc/set_fomo_collector_session", {
    method: "POST",
    body: JSON.stringify({ new_sealed_session: sealedSession }),
  });
}

export async function consumeFomoCollectorBootstrapToken(tokenHash: string) {
  const response = await supabaseRequest("rpc/consume_fomo_collector_bootstrap_token", {
    method: "POST",
    body: JSON.stringify({ candidate_token_hash: tokenHash }),
  });
  return Boolean(await response.json());
}

export async function claimFomoCollector() {
  const response = await supabaseRequest("rpc/claim_fomo_collector", {
    method: "POST",
    body: JSON.stringify({ lease_seconds: 260 }),
  });
  const rows = await response.json() as FomoCollectorClaimRow[];
  const row = rows[0];
  return row ? { claimToken: row.claim_token, sealedSession: row.sealed_session } : null;
}

export async function completeFomoCollector(claimToken: string, sealedSession: string, counts: Record<string, number>) {
  const response = await supabaseRequest("rpc/complete_fomo_collector", {
    method: "POST",
    body: JSON.stringify({ completed_claim_token: claimToken, next_sealed_session: sealedSession, capture_counts: counts }),
  });
  return Boolean(await response.json());
}

export async function failFomoCollector(claimToken: string, message: string) {
  const response = await supabaseRequest("rpc/fail_fomo_collector", {
    method: "POST",
    body: JSON.stringify({ completed_claim_token: claimToken, failure_message: message }),
  });
  return Boolean(await response.json());
}

export async function getFomoCollectorStatus() {
  if (!isSupabaseConfigured()) return { status: "unavailable" as const };
  const response = await supabaseRequest("rpc/get_fomo_collector_status", { method: "POST", body: "{}" });
  const rows = await response.json() as FomoCollectorStatusRow[];
  const row = rows[0];
  return row ? {
    status: row.status,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    consecutiveFailures: row.consecutive_failures,
    lastCounts: row.last_counts,
    updatedAt: row.updated_at,
  } : { status: "setup_required" as const };
}

type FomoLeaderboardRow = {
  period: FomoLeaderboardObservation["window"];
  normalized_handle: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  platform_rank: number;
  realized_pnl_usd: number | string | null;
  volume_usd: number | string | null;
  trade_count: number | null;
  follower_count: number | null;
  source_url: string;
  captured_at: string;
};

export async function readFomoFirstPartyLeaderboard(window: FomoLeaderboardObservation["window"] = "24h"): Promise<FomoLeaderboardObservation[]> {
  if (!isSupabaseConfigured()) return [];
  const columns = "period,normalized_handle,handle,display_name,avatar_url,platform_rank,realized_pnl_usd,volume_usd,trade_count,follower_count,source_url,captured_at";
  const response = await supabaseRequest(`fomo_leaderboard_observations?period=eq.${window}&select=${columns}&order=captured_at.desc,platform_rank.asc&limit=500`);
  const candidates = await response.json() as FomoLeaderboardRow[];
  const latestCapturedAt = candidates[0]?.captured_at;
  const rows = latestCapturedAt ? candidates.filter((row) => row.captured_at === latestCapturedAt) : [];
  return rows.map((row) => ({
    window: row.period,
    normalizedHandle: row.normalized_handle,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    platformRank: row.platform_rank,
    realizedPnlUsd: row.realized_pnl_usd === null ? null : Number(row.realized_pnl_usd),
    volumeUsd: row.volume_usd === null ? null : Number(row.volume_usd),
    tradeCount: row.trade_count,
    followerCount: row.follower_count,
    sourceUrl: row.source_url,
    capturedAt: row.captured_at,
  }));
}

type StoredFomoProfileRow = {
  id: string;
  platform_profile_id: string;
  handle: string | null;
  display_name: string | null;
  profile_url: string;
  metadata: Record<string, unknown> | null;
};

export async function readStoredFomoProfile(handle: string): Promise<(PlatformProfileRecord & { avatarUrl: string | null }) | null> {
  if (!isSupabaseConfigured()) return null;
  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  const profileResponse = await supabaseRequest(`social_profiles?platform=eq.fomo&handle=ilike.${encodeURIComponent(normalized)}&select=id,platform_profile_id,handle,display_name,profile_url,metadata&order=observed_at.desc&limit=1`);
  const profiles = await profileResponse.json() as StoredFomoProfileRow[];
  const profile = profiles[0];
  if (!profile) return null;
  const walletResponse = await supabaseRequest(`wallet_links?profile_id=eq.${encodeURIComponent(profile.id)}&valid_to=is.null&select=wallet&order=valid_from.desc&limit=1`);
  const wallets = await walletResponse.json() as Array<{ wallet: string }>;
  const followerCount = typeof profile.metadata?.follower_count === "number" ? profile.metadata.follower_count : null;
  return {
    platform: "fomo",
    platformProfileId: profile.platform_profile_id,
    handle: profile.handle,
    displayName: profile.display_name,
    profileUrl: profile.profile_url,
    primaryWallet: wallets[0]?.wallet ?? null,
    visibleFollowerCount: followerCount,
    avatarUrl: typeof profile.metadata?.avatar_url === "string" ? profile.metadata.avatar_url : null,
  };
}

type FomoWalletLinkRow = {
  wallet: string;
  social_profiles: StoredFomoProfileRow | StoredFomoProfileRow[] | null;
};

export async function readStoredFomoIdentitiesByWallet(wallets: string[]) {
  if (!isSupabaseConfigured() || !wallets.length) return new Map<string, FomoIdentity>();
  const unique = [...new Set(wallets)].slice(0, 100);
  const select = "wallet,social_profiles!inner(id,platform_profile_id,handle,display_name,profile_url,metadata)";
  const response = await supabaseRequest(`wallet_links?wallet=in.(${unique.map(encodeURIComponent).join(",")})&valid_to=is.null&social_profiles.platform=eq.fomo&select=${encodeURIComponent(select)}`);
  const rows = await response.json() as FomoWalletLinkRow[];
  return new Map(rows.flatMap((row): Array<[string, FomoIdentity]> => {
    const profile = Array.isArray(row.social_profiles) ? row.social_profiles[0] : row.social_profiles;
    if (!profile) return [];
    return [[row.wallet, { handle: profile.handle, identityId: profile.platform_profile_id, avatarUrl: typeof profile.metadata?.avatar_url === "string" ? profile.metadata.avatar_url : null, source: "first_party" }]];
  }));
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

export async function persistFomoFollowerSnapshot(owner: PlatformProfileRecord, followers: PlatformFollowerRecord[], metrics: FollowerEdgeMetrics) {
  if (!isSupabaseConfigured()) return false;
  await supabaseRequest("rpc/capture_fomo_follower_snapshot", {
    method: "POST",
    body: JSON.stringify({
      owner_profile_id: owner.platformProfileId,
      owner_handle: owner.handle,
      owner_display_name: owner.displayName,
      owner_profile_url: owner.profileUrl,
      follower_items: followers.map((follower) => ({
        platform_profile_id: follower.platformFollowerId,
        handle: follower.handle,
        profile_url: follower.profileUrl,
        wallet: follower.verifiedWallet,
        resolution_status: follower.resolutionStatus,
      })),
      snapshot_metrics: metrics,
      snapshot_observed_at: new Date(metrics.calculatedAt).toISOString(),
    }),
  });
  return true;
}

type SignalSnapshotRow = { value: FollowerEdgeMetrics };
export async function readFollowerEdgeSnapshot(platform: "pump" | "fomo", platformProfileId: string): Promise<FollowerEdgeMetrics | null> {
  if (!isSupabaseConfigured()) return null;
  const subjectKey = `${platform}:${platformProfileId}`;
  const path = `signal_snapshots?subject_type=eq.profile&subject_key=eq.${encodeURIComponent(subjectKey)}&metric_name=eq.follower_edge&select=value&order=observed_at.desc&limit=1`;
  const response = await supabaseRequest(path);
  const rows = await response.json() as SignalSnapshotRow[];
  return rows[0]?.value ?? null;
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
    metadata: Record<string, unknown> | null;
  } | Array<{
    platform: TokenSocialActor["platform"];
    platform_profile_id: string;
    handle: string | null;
    display_name: string | null;
    profile_url: string;
    metadata: Record<string, unknown> | null;
  }> | null;
};

export async function readTokenSocialActors(mint: string): Promise<TokenSocialActor[]> {
  if (!isSupabaseConfigured()) return [];
  const select = "profile_id,wallet,relationship,confidence,observed_at,social_profiles!inner(platform,platform_profile_id,handle,display_name,profile_url,metadata)";
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
      avatarUrl: typeof profile.metadata?.avatar_url === "string" ? profile.metadata.avatar_url : null,
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

export async function persistFomoTokenTheses(mint: string, theses: FomoTokenThesis[]) {
  if (!isSupabaseConfigured() || !theses.length) return 0;
  const response = await supabaseRequest("rpc/capture_fomoscan_thesis_batch", {
    method: "POST",
    body: JSON.stringify({
      evidence_mint: mint,
      evidence_items: theses.map((thesis) => ({
        provider_id: thesis.providerId,
        author_id: thesis.authorId,
        author_handle: thesis.authorHandle,
        author_name: thesis.authorName,
        profile_url: thesis.profileUrl,
        source_url: thesis.sourceUrl,
        source_text: thesis.sourceText,
        published_at: thesis.publishedAt,
        content_hash: thesis.contentHash,
        like_count: thesis.likeCount,
        holdings_usd: thesis.holdingsUsd,
        realized_pnl_usd: thesis.realizedPnlUsd,
        unrealized_pnl_usd: thesis.unrealizedPnlUsd,
        closed_at: thesis.closedAt,
      })),
    }),
  });
  return Number(await response.json());
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
