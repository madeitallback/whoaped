-- Store FomoScan-resolved leaderboard identities independently from any one
-- token. A profile may intentionally have no public Solana address; retaining
-- that resolution prevents repeatedly spending provider quota on it.
create or replace function public.upsert_fomo_leaderboard_profiles(identities jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  resolved_profile_id uuid;
  observed_at_value timestamptz;
  affected integer := 0;
begin
  if jsonb_typeof(identities) <> 'array' or jsonb_array_length(identities) > 100 then
    raise exception 'invalid Fomo leaderboard identity batch';
  end if;

  for item in select value from jsonb_array_elements(identities)
  loop
    if coalesce(item->>'platform_profile_id', '') = ''
      or coalesce(item->>'profile_url', '') = '' then
      continue;
    end if;
    observed_at_value := coalesce(nullif(item->>'observed_at', '')::timestamptz, now());

    insert into public.social_profiles (
      platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at
    ) values (
      'fomo', item->>'platform_profile_id', nullif(item->>'handle', ''), nullif(item->>'display_name', ''),
      item->>'profile_url', jsonb_strip_nulls(jsonb_build_object('source', 'fomoscan', 'avatar_url', nullif(item->>'avatar_url', ''))),
      observed_at_value, observed_at_value
    ) on conflict (platform, platform_profile_id) do update set
      handle = coalesce(excluded.handle, public.social_profiles.handle),
      display_name = coalesce(excluded.display_name, public.social_profiles.display_name),
      profile_url = excluded.profile_url,
      metadata = public.social_profiles.metadata || excluded.metadata,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at
    returning id into resolved_profile_id;

    if coalesce(item->>'wallet', '') <> '' and not exists (
      select 1 from public.wallet_links
      where profile_id = resolved_profile_id and wallet = item->>'wallet' and valid_to is null
    ) then
      insert into public.wallet_links (profile_id, chain, wallet, verification_source, confidence, evidence_url, valid_from)
      values (resolved_profile_id, 'solana', item->>'wallet', 'fomoscan', 'verified', item->>'profile_url', observed_at_value);
    end if;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

revoke all on function public.upsert_fomo_leaderboard_profiles(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_fomo_leaderboard_profiles(jsonb) to service_role;
notify pgrst, 'reload schema';
