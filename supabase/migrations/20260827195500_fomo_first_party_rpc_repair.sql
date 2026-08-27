create index if not exists fomo_identity_evidence_mint_idx
  on public.fomo_identity_evidence (mint) where mint is not null;

create or replace function public.capture_fomo_first_party_leaderboard(
  capture_window text,
  capture_source_url text,
  capture_observed_at timestamptz,
  capture_items jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  profile_key text;
  affected integer := 0;
begin
  if capture_window not in ('24h', '7d', '30d', 'all')
     or jsonb_typeof(capture_items) <> 'array'
     or jsonb_array_length(capture_items) > 500 then
    raise exception 'invalid Fomo leaderboard capture';
  end if;
  for item in select value from jsonb_array_elements(capture_items)
  loop
    profile_key := 'handle:' || (item->>'normalized_handle');
    if coalesce(item->>'normalized_handle', '') = ''
       or coalesce(item->>'handle', '') = ''
       or coalesce(item->>'platform_rank', '') !~ '^[0-9]+$' then
      continue;
    end if;
    insert into public.social_profiles (platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at)
    values (
      'fomo', profile_key, item->>'handle', nullif(item->>'display_name', ''),
      'https://fomo.family/profile/' || (item->>'handle'),
      jsonb_strip_nulls(jsonb_build_object(
        'identity_source', 'authorized_visible_capture',
        'avatar_url', nullif(item->>'avatar_url', ''),
        'follower_count', nullif(item->>'follower_count', '')::integer
      )), capture_observed_at, capture_observed_at
    ) on conflict (platform, platform_profile_id) do update set
      handle = excluded.handle,
      display_name = coalesce(excluded.display_name, public.social_profiles.display_name),
      profile_url = excluded.profile_url,
      metadata = public.social_profiles.metadata || excluded.metadata,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at;
    insert into public.fomo_leaderboard_observations (
      period, normalized_handle, handle, display_name, avatar_url, platform_rank,
      realized_pnl_usd, volume_usd, trade_count, follower_count, source_url, captured_at, updated_at
    ) values (
      capture_window, item->>'normalized_handle', item->>'handle', nullif(item->>'display_name', ''),
      nullif(item->>'avatar_url', ''), (item->>'platform_rank')::integer,
      nullif(item->>'realized_pnl_usd', '')::numeric, nullif(item->>'volume_usd', '')::numeric,
      nullif(item->>'trade_count', '')::integer, nullif(item->>'follower_count', '')::integer,
      capture_source_url, capture_observed_at, capture_observed_at
    ) on conflict (period, normalized_handle, captured_at) do update set
      handle = excluded.handle, display_name = excluded.display_name, avatar_url = excluded.avatar_url,
      platform_rank = excluded.platform_rank, realized_pnl_usd = excluded.realized_pnl_usd,
      volume_usd = excluded.volume_usd, trade_count = excluded.trade_count,
      follower_count = excluded.follower_count, source_url = excluded.source_url, updated_at = excluded.updated_at;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

revoke all on function public.capture_fomo_first_party_leaderboard(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.capture_fomo_first_party_leaderboard(text, text, timestamptz, jsonb) to service_role;

create or replace function public.capture_fomo_token_holder_batch(
  capture_mint text,
  capture_source_url text,
  capture_observed_at timestamptz,
  capture_items jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  resolved_profile_id uuid;
  evidence_hash text;
  affected integer := 0;
begin
  if jsonb_typeof(capture_items) <> 'array' or jsonb_array_length(capture_items) > 100 then
    raise exception 'invalid Fomo holder capture';
  end if;
  for item in select value from jsonb_array_elements(capture_items)
  loop
    insert into public.fomo_token_holder_observations (
      mint, normalized_handle, handle, profile_url, avatar_url, thesis_text,
      amount_text, amount_low_ui, amount_high_ui, hold_time_text, value_usd, pnl_usd, roi_pct,
      trade_events, resolved_wallet, resolution_confidence, resolution_method, resolution_evidence,
      source_url, captured_at, updated_at
    ) values (
      capture_mint, item->>'normalized_handle', item->>'handle',
      'https://fomo.family/profile/' || (item->>'handle'), nullif(item->>'avatar_url', ''), nullif(item->>'thesis_text', ''),
      item->>'amount_text', (item->>'amount_low_ui')::numeric, (item->>'amount_high_ui')::numeric,
      nullif(item->>'hold_time_text', ''), nullif(item->>'value_usd', '')::numeric,
      nullif(item->>'pnl_usd', '')::numeric, nullif(item->>'roi_pct', '')::numeric,
      coalesce(item->'trade_events', '[]'::jsonb), nullif(item->>'wallet', ''), item->>'confidence', item->>'resolution_method',
      coalesce(item->'resolution_evidence', '{}'::jsonb), capture_source_url, capture_observed_at, capture_observed_at
    ) on conflict (mint, normalized_handle) do update set
      handle = excluded.handle, profile_url = excluded.profile_url,
      avatar_url = coalesce(excluded.avatar_url, public.fomo_token_holder_observations.avatar_url),
      thesis_text = coalesce(excluded.thesis_text, public.fomo_token_holder_observations.thesis_text),
      amount_text = excluded.amount_text, amount_low_ui = excluded.amount_low_ui, amount_high_ui = excluded.amount_high_ui,
      hold_time_text = excluded.hold_time_text, value_usd = excluded.value_usd, pnl_usd = excluded.pnl_usd,
      roi_pct = excluded.roi_pct, trade_events = excluded.trade_events,
      resolved_wallet = coalesce(excluded.resolved_wallet, public.fomo_token_holder_observations.resolved_wallet),
      resolution_confidence = case when excluded.resolved_wallet is not null then excluded.resolution_confidence else public.fomo_token_holder_observations.resolution_confidence end,
      resolution_method = case when excluded.resolved_wallet is not null then excluded.resolution_method else public.fomo_token_holder_observations.resolution_method end,
      resolution_evidence = public.fomo_token_holder_observations.resolution_evidence || excluded.resolution_evidence,
      source_url = excluded.source_url, captured_at = excluded.captured_at, updated_at = excluded.updated_at;
    if nullif(item->>'wallet', '') is not null and item->>'confidence' = 'high' then
      insert into public.social_profiles (platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at)
      values (
        'fomo', 'handle:' || (item->>'normalized_handle'), item->>'handle', item->>'handle',
        'https://fomo.family/profile/' || (item->>'handle'),
        jsonb_strip_nulls(jsonb_build_object('identity_source', 'authorized_visible_capture', 'avatar_url', nullif(item->>'avatar_url', ''))),
        capture_observed_at, capture_observed_at
      ) on conflict (platform, platform_profile_id) do update set
        handle = excluded.handle, display_name = excluded.display_name, profile_url = excluded.profile_url,
        metadata = public.social_profiles.metadata || excluded.metadata, observed_at = excluded.observed_at, updated_at = excluded.updated_at
      returning id into resolved_profile_id;
      if not exists (select 1 from public.wallet_links where profile_id = resolved_profile_id and wallet = item->>'wallet' and valid_to is null) then
        insert into public.wallet_links (profile_id, chain, wallet, verification_source, confidence, evidence_url, valid_from)
        values (resolved_profile_id, 'solana', item->>'wallet', 'extension', 'high', capture_source_url, capture_observed_at);
      end if;
      insert into public.fomo_identity_evidence (profile_id, wallet, mint, resolution_method, resolver_version, evidence, source_url, observed_at)
      values (
        resolved_profile_id, item->>'wallet', capture_mint, item->>'resolution_method', 'fomo-identity-v2',
        coalesce(item->'resolution_evidence', '{}'::jsonb), capture_source_url, capture_observed_at
      ) on conflict (profile_id, wallet, mint, resolver_version) do update set
        resolution_method = excluded.resolution_method,
        evidence = public.fomo_identity_evidence.evidence || excluded.evidence,
        source_url = excluded.source_url, observed_at = excluded.observed_at;
      insert into public.token_social_actors (mint, profile_id, wallet, relationship, confidence, observed_at, updated_at)
      values (capture_mint, resolved_profile_id, item->>'wallet', 'holder', 'high', capture_observed_at, capture_observed_at)
      on conflict (mint, profile_id, wallet) do update set
        relationship = 'holder', confidence = excluded.confidence, observed_at = excluded.observed_at, updated_at = excluded.updated_at;
      if length(coalesce(item->>'thesis_text', '')) between 3 and 4000 then
        evidence_hash := encode(digest('fomo-visible|' || resolved_profile_id::text || '|' || capture_mint || '|' || (item->>'thesis_text'), 'sha256'), 'hex');
        insert into public.thesis_evidence (profile_id, mint, source_url, source_text, captured_at, content_hash, relevance, metadata)
        values (resolved_profile_id, capture_mint, capture_source_url, item->>'thesis_text', capture_observed_at, evidence_hash, 'contextual', jsonb_build_object('capture_method', 'authorized-visible-token-holder', 'schema_version', 2))
        on conflict (profile_id, mint, content_hash) do update set captured_at = greatest(public.thesis_evidence.captured_at, excluded.captured_at);
      end if;
    end if;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

revoke all on function public.capture_fomo_token_holder_batch(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.capture_fomo_token_holder_batch(text, text, timestamptz, jsonb) to service_role;

notify pgrst, 'reload schema';
