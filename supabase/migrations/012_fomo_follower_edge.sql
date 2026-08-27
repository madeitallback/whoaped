create table if not exists public.social_followers (
  owner_profile_id uuid not null references public.social_profiles(id) on delete cascade,
  follower_profile_id uuid not null references public.social_profiles(id) on delete cascade,
  collection_method text not null check (collection_method in ('public-api', 'visible-dom')),
  resolution_status text not null check (resolution_status in ('verified', 'unresolved', 'ambiguous')),
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (owner_profile_id, follower_profile_id)
);

create index if not exists social_followers_owner_observed_idx on public.social_followers (owner_profile_id, observed_at desc);
alter table public.social_followers enable row level security;
revoke all on table public.social_followers from anon, authenticated;

create or replace function public.capture_fomo_follower_snapshot(
  owner_profile_id text,
  owner_handle text,
  owner_display_name text,
  owner_profile_url text,
  follower_items jsonb,
  snapshot_metrics jsonb,
  snapshot_observed_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  owner_uuid uuid;
  follower_uuid uuid;
  affected integer := 0;
begin
  if coalesce(owner_profile_id, '') = '' or jsonb_typeof(follower_items) <> 'array' or jsonb_array_length(follower_items) > 100 then
    raise exception 'invalid Fomo follower snapshot';
  end if;

  insert into public.social_profiles (platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at)
  values ('fomo', owner_profile_id, nullif(owner_handle, ''), nullif(owner_display_name, ''), owner_profile_url,
    jsonb_build_object('follower_collection', 'visible-dom'), snapshot_observed_at, snapshot_observed_at)
  on conflict (platform, platform_profile_id) do update set
    handle = coalesce(excluded.handle, public.social_profiles.handle), display_name = coalesce(excluded.display_name, public.social_profiles.display_name),
    profile_url = excluded.profile_url, metadata = public.social_profiles.metadata || excluded.metadata,
    observed_at = excluded.observed_at, updated_at = excluded.updated_at
  returning id into owner_uuid;

  for item in select value from jsonb_array_elements(follower_items)
  loop
    if coalesce(item->>'platform_profile_id', '') = '' then continue; end if;
    insert into public.social_profiles (platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at)
    values ('fomo', item->>'platform_profile_id', nullif(item->>'handle', ''), nullif(item->>'handle', ''),
      coalesce(nullif(item->>'profile_url', ''), 'https://fomo.family/'), jsonb_build_object('identity_source', 'fomoscan'), snapshot_observed_at, snapshot_observed_at)
    on conflict (platform, platform_profile_id) do update set
      handle = coalesce(excluded.handle, public.social_profiles.handle), profile_url = excluded.profile_url,
      metadata = public.social_profiles.metadata || excluded.metadata, observed_at = excluded.observed_at, updated_at = excluded.updated_at
    returning id into follower_uuid;

    if coalesce(item->>'wallet', '') <> '' and not exists (
      select 1 from public.wallet_links where profile_id = follower_uuid and wallet = item->>'wallet' and valid_to is null
    ) then
      insert into public.wallet_links (profile_id, chain, wallet, verification_source, confidence, evidence_url, valid_from)
      values (follower_uuid, 'solana', item->>'wallet', 'fomoscan', 'verified', item->>'profile_url', snapshot_observed_at);
    end if;

    insert into public.social_followers (owner_profile_id, follower_profile_id, collection_method, resolution_status, observed_at)
    values (owner_uuid, follower_uuid, 'visible-dom', coalesce(nullif(item->>'resolution_status', ''), 'unresolved'), snapshot_observed_at)
    on conflict (owner_profile_id, follower_profile_id) do update set resolution_status = excluded.resolution_status, observed_at = excluded.observed_at;
    affected := affected + 1;
  end loop;

  insert into public.signal_snapshots (subject_type, subject_key, metric_name, metric_version, value, population, coverage, confidence, observed_at)
  values ('profile', 'fomo:' || owner_profile_id, 'follower_edge', coalesce(snapshot_metrics->>'metricVersion', 'follower-v1-sample'), snapshot_metrics,
    jsonb_build_object('visible_followers', snapshot_metrics->'visibleFollowers', 'sampled_followers', snapshot_metrics->'sampledFollowers'),
    jsonb_build_object('accessible_followers', snapshot_metrics->'accessibleFollowers', 'data_completeness', snapshot_metrics->'dataCompleteness'),
    coalesce(snapshot_metrics->>'confidence', 'low'), snapshot_observed_at)
  on conflict (subject_type, subject_key, metric_name, metric_version, observed_at) do update set value = excluded.value, population = excluded.population, coverage = excluded.coverage, confidence = excluded.confidence;
  return affected;
end;
$$;

revoke all on function public.capture_fomo_follower_snapshot(text, text, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.capture_fomo_follower_snapshot(text, text, text, text, jsonb, jsonb, timestamptz) to service_role;
grant select on public.signal_snapshots to service_role;
