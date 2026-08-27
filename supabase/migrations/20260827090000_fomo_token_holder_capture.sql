create table if not exists public.fomo_token_holder_observations (
  mint text not null references public.tokens(mint) on delete cascade,
  normalized_handle text not null,
  handle text not null,
  profile_url text not null,
  amount_text text not null,
  amount_low_ui numeric not null check (amount_low_ui >= 0),
  amount_high_ui numeric not null check (amount_high_ui > amount_low_ui),
  hold_time_text text,
  value_usd numeric,
  pnl_usd numeric,
  roi_pct numeric,
  resolved_wallet text,
  resolution_confidence text not null check (resolution_confidence in ('unresolved', 'high')),
  resolution_method text not null check (resolution_method in ('none', 'unique_rounded_balance')),
  source_url text not null,
  captured_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (mint, normalized_handle)
);

create index if not exists fomo_token_holder_observations_wallet_idx on public.fomo_token_holder_observations (mint, resolved_wallet) where resolved_wallet is not null;
alter table public.fomo_token_holder_observations enable row level security;
revoke all on table public.fomo_token_holder_observations from public, anon, authenticated;
grant select, insert, update on table public.fomo_token_holder_observations to service_role;

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
  affected integer := 0;
begin
  for item in select value from jsonb_array_elements(capture_items)
  loop
    insert into public.fomo_token_holder_observations (
      mint, normalized_handle, handle, profile_url, amount_text, amount_low_ui, amount_high_ui,
      hold_time_text, value_usd, pnl_usd, roi_pct, resolved_wallet, resolution_confidence,
      resolution_method, source_url, captured_at, updated_at
    ) values (
      capture_mint, item->>'normalized_handle', item->>'handle',
      'https://fomo.family/profile/' || item->>'handle', item->>'amount_text',
      (item->>'amount_low_ui')::numeric, (item->>'amount_high_ui')::numeric,
      nullif(item->>'hold_time_text', ''), nullif(item->>'value_usd', '')::numeric,
      nullif(item->>'pnl_usd', '')::numeric, nullif(item->>'roi_pct', '')::numeric,
      nullif(item->>'wallet', ''), item->>'confidence', item->>'resolution_method',
      capture_source_url, capture_observed_at, capture_observed_at
    ) on conflict (mint, normalized_handle) do update set
      handle = excluded.handle, profile_url = excluded.profile_url, amount_text = excluded.amount_text,
      amount_low_ui = excluded.amount_low_ui, amount_high_ui = excluded.amount_high_ui,
      hold_time_text = excluded.hold_time_text, value_usd = excluded.value_usd,
      pnl_usd = excluded.pnl_usd, roi_pct = excluded.roi_pct,
      resolved_wallet = excluded.resolved_wallet, resolution_confidence = excluded.resolution_confidence,
      resolution_method = excluded.resolution_method, source_url = excluded.source_url,
      captured_at = excluded.captured_at, updated_at = excluded.updated_at;

    if nullif(item->>'wallet', '') is not null and item->>'confidence' = 'high' then
      insert into public.social_profiles (platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at)
      values ('fomo', 'handle:' || item->>'normalized_handle', item->>'handle', item->>'handle',
        'https://fomo.family/profile/' || item->>'handle', jsonb_build_object('source', 'authorized_visible_capture'), capture_observed_at, capture_observed_at)
      on conflict (platform, platform_profile_id) do update set
        handle = excluded.handle, display_name = excluded.display_name, profile_url = excluded.profile_url,
        metadata = public.social_profiles.metadata || excluded.metadata, observed_at = excluded.observed_at, updated_at = excluded.updated_at
      returning id into resolved_profile_id;

      if not exists (select 1 from public.wallet_links where profile_id = resolved_profile_id and wallet = item->>'wallet' and valid_to is null) then
        insert into public.wallet_links (profile_id, chain, wallet, verification_source, confidence, evidence_url, valid_from)
        values (resolved_profile_id, 'solana', item->>'wallet', 'extension', 'high', capture_source_url, capture_observed_at);
      end if;

      insert into public.token_social_actors (mint, profile_id, wallet, relationship, confidence, observed_at, updated_at)
      values (capture_mint, resolved_profile_id, item->>'wallet', 'holder', 'high', capture_observed_at, capture_observed_at)
      on conflict (mint, profile_id, wallet) do update set
        relationship = 'holder', confidence = excluded.confidence, observed_at = excluded.observed_at, updated_at = excluded.updated_at;
    end if;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

revoke all on function public.capture_fomo_token_holder_batch(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.capture_fomo_token_holder_batch(text, text, timestamptz, jsonb) to service_role;
