create table if not exists public.token_social_actors (
  mint text not null references public.tokens(mint) on delete cascade,
  profile_id uuid not null references public.social_profiles(id) on delete cascade,
  wallet text not null,
  relationship text not null check (relationship in ('buyer', 'holder', 'both', 'observed')),
  confidence text not null check (confidence in ('low', 'medium', 'high', 'verified')),
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (mint, profile_id, wallet)
);

create index if not exists token_social_actors_mint_idx on public.token_social_actors (mint, relationship, observed_at desc);
alter table public.token_social_actors enable row level security;
revoke all on table public.token_social_actors from anon, authenticated;

create or replace function public.upsert_fomo_identity_batch(identity_mint text, identities jsonb)
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
      'fomo', item->>'platform_profile_id', nullif(item->>'handle', ''), nullif(item->>'handle', ''),
      item->>'profile_url', jsonb_build_object('source', item->>'source'),
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
        resolved_profile_id, 'solana', item->>'wallet', 'fomoscan', 'verified', item->>'profile_url',
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

revoke all on function public.upsert_fomo_identity_batch(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_fomo_identity_batch(text, jsonb) to service_role;
