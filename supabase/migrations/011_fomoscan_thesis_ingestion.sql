create or replace function public.capture_fomoscan_thesis_batch(
  evidence_mint text,
  evidence_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  resolved_profile_id uuid;
  affected integer := 0;
begin
  if jsonb_typeof(evidence_items) <> 'array' or jsonb_array_length(evidence_items) > 50 then
    raise exception 'invalid FomoScan evidence batch';
  end if;
  if not exists (select 1 from public.tokens where mint = evidence_mint) then
    raise exception 'token must be persisted before thesis evidence';
  end if;

  for item in select value from jsonb_array_elements(evidence_items)
  loop
    if coalesce(item->>'provider_id', '') = ''
       or coalesce(item->>'author_id', '') = ''
       or length(coalesce(item->>'source_text', '')) not between 3 and 4000
       or coalesce(item->>'content_hash', '') !~ '^[0-9a-f]{64}$' then
      continue;
    end if;

    insert into public.social_profiles (
      platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at
    ) values (
      'fomo', item->>'author_id', nullif(item->>'author_handle', ''), nullif(item->>'author_name', ''),
      item->>'profile_url', jsonb_build_object('identity_source', 'fomoscan-thesis'), timezone('utc', now()), timezone('utc', now())
    )
    on conflict (platform, platform_profile_id) do update set
      handle = coalesce(excluded.handle, public.social_profiles.handle),
      display_name = coalesce(excluded.display_name, public.social_profiles.display_name),
      profile_url = excluded.profile_url,
      metadata = public.social_profiles.metadata || excluded.metadata,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at
    returning id into resolved_profile_id;

    insert into public.thesis_evidence (
      profile_id, mint, source_url, source_text, published_at, captured_at, content_hash, relevance, metadata
    ) values (
      resolved_profile_id, evidence_mint, item->>'source_url', item->>'source_text',
      nullif(item->>'published_at', '')::timestamptz, timezone('utc', now()), item->>'content_hash', 'explicit',
      jsonb_build_object(
        'capture_method', 'fomoscan-token-feed', 'provider', 'fomoscan', 'provider_id', item->>'provider_id',
        'like_count', item->'like_count', 'holdings_usd', item->'holdings_usd',
        'realized_pnl_usd', item->'realized_pnl_usd', 'unrealized_pnl_usd', item->'unrealized_pnl_usd',
        'closed_at', item->'closed_at', 'schema_version', 1
      )
    )
    on conflict (profile_id, mint, content_hash) do update set
      captured_at = greatest(public.thesis_evidence.captured_at, excluded.captured_at),
      metadata = public.thesis_evidence.metadata || excluded.metadata;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

revoke all on function public.capture_fomoscan_thesis_batch(text, jsonb) from public, anon, authenticated;
grant execute on function public.capture_fomoscan_thesis_batch(text, jsonb) to service_role;
