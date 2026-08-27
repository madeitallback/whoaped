create or replace function public.upsert_pump_identity_batch(identity_mint text, identities jsonb)
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
  for item in select value from jsonb_array_elements(identities)
  loop
    insert into public.social_profiles (
      platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at
    ) values (
      'pump', item->>'platform_profile_id', nullif(item->>'handle', ''), nullif(item->>'display_name', ''),
      item->>'profile_url', jsonb_build_object('visible_follower_count', item->'visible_follower_count', 'identity_source', 'pump-public-profile'),
      (item->>'observed_at')::timestamptz, (item->>'observed_at')::timestamptz
    )
    on conflict (platform, platform_profile_id) do update set
      handle = coalesce(excluded.handle, public.social_profiles.handle),
      display_name = coalesce(excluded.display_name, public.social_profiles.display_name),
      profile_url = excluded.profile_url,
      metadata = public.social_profiles.metadata || excluded.metadata,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at
    returning id into resolved_profile_id;

    if not exists (
      select 1 from public.wallet_links
      where profile_id = resolved_profile_id and wallet = item->>'wallet' and valid_to is null
    ) then
      insert into public.wallet_links (
        profile_id, chain, wallet, verification_source, confidence, evidence_url, valid_from
      ) values (
        resolved_profile_id, 'solana', item->>'wallet', 'platform', 'verified', item->>'profile_url',
        (item->>'observed_at')::timestamptz
      );
    end if;

    insert into public.token_social_actors (
      mint, profile_id, wallet, relationship, confidence, observed_at, updated_at
    ) values (
      identity_mint, resolved_profile_id, item->>'wallet', item->>'relationship', 'verified',
      (item->>'observed_at')::timestamptz, (item->>'observed_at')::timestamptz
    )
    on conflict (mint, profile_id, wallet) do update set
      relationship = excluded.relationship,
      confidence = excluded.confidence,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

revoke all on function public.upsert_pump_identity_batch(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_pump_identity_batch(text, jsonb) to service_role;
