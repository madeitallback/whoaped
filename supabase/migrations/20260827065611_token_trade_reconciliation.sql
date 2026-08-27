create table if not exists public.token_trade_events (
  mint text not null references public.tokens(mint) on delete cascade,
  signature text not null,
  wallet text not null,
  venue text not null check (venue in ('curve', 'pumpswap')),
  phase text not null check (phase in ('pre_grad', 'post_grad')),
  side text not null check (side in ('buy', 'sell')),
  quantity_raw numeric(78, 0) check (quantity_raw is null or quantity_raw >= 0),
  occurred_at timestamptz,
  decoder_version integer not null,
  decoder_variant text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (mint, signature, wallet, venue, side)
);

create index if not exists token_trade_events_wallet_time_idx
  on public.token_trade_events (wallet, occurred_at desc nulls last);
create index if not exists token_trade_events_mint_time_idx
  on public.token_trade_events (mint, occurred_at desc nulls last);
create index if not exists token_trade_events_mint_wallet_side_idx
  on public.token_trade_events (mint, wallet, side);

alter table public.token_trade_events enable row level security;
revoke all on table public.token_trade_events from public, anon, authenticated;
grant select, insert, update on public.token_trade_events to service_role;

insert into public.token_trade_events (
  mint, signature, wallet, venue, phase, side, quantity_raw,
  occurred_at, decoder_version, decoder_variant, created_at
)
select mint, signature, wallet, venue, phase, 'buy', null,
       occurred_at, decoder_version, 'legacy_buy_table', created_at
from public.token_buy_events
on conflict (mint, signature, wallet, venue, side) do nothing;

create or replace function public.reconcile_token_trade_activity(activity_mint text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  if not exists (select 1 from public.tokens where mint = activity_mint) then
    raise exception 'Token % must exist before reconciling activity', activity_mint;
  end if;

  insert into public.token_positions (
    mint, wallet, token_account, balance_ui, pct_of_supply, current_label,
    coverage_state, observed_at, updated_at
  )
  select activity_mint, event.wallet, null, 0, 0, 'unknown', 'partial',
         coalesce(max(event.occurred_at), timezone('utc', now())), timezone('utc', now())
  from public.token_trade_events event
  where event.mint = activity_mint
  group by event.wallet
  on conflict (mint, wallet) do nothing;

  with activity as (
    select
      wallet,
      min(occurred_at) filter (where side = 'buy') as first_buy_at,
      max(occurred_at) filter (where side = 'buy') as last_buy_at,
      max(occurred_at) filter (where side = 'sell') as last_sell_at,
      count(*) filter (where side = 'buy')::integer as buy_tx_count,
      count(*) filter (where side = 'sell')::integer as sell_tx_count
    from public.token_trade_events
    where mint = activity_mint
    group by wallet
  )
  update public.token_positions position
  set first_buy_at = activity.first_buy_at,
      last_buy_at = activity.last_buy_at,
      last_sell_at = activity.last_sell_at,
      buy_tx_count = activity.buy_tx_count,
      sell_tx_count = activity.sell_tx_count,
      updated_at = timezone('utc', now())
  from activity
  where position.mint = activity_mint and position.wallet = activity.wallet;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.reconcile_token_trade_activity(text) from public, anon, authenticated;
grant execute on function public.reconcile_token_trade_activity(text) to service_role;

create or replace function public.replace_token_positions(
  position_mint text,
  snapshot_observed_at timestamptz,
  positions jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if not exists (select 1 from public.tokens where mint = position_mint) then
    raise exception 'Token % must exist before replacing positions', position_mint;
  end if;

  update public.token_positions
  set token_account = null,
      balance_ui = 0,
      pct_of_supply = 0,
      coverage_state = 'complete',
      observed_at = snapshot_observed_at,
      updated_at = snapshot_observed_at
  where mint = position_mint;

  insert into public.token_positions (
    mint, wallet, token_account, balance_ui, pct_of_supply, current_label,
    coverage_state, observed_at, updated_at
  )
  select
    position_mint, row.wallet, row.token_account, row.balance_ui,
    row.pct_of_supply, coalesce(row.current_label, 'unknown'),
    'complete', snapshot_observed_at, snapshot_observed_at
  from jsonb_to_recordset(positions) as row(
    wallet text,
    token_account text,
    balance_ui numeric,
    pct_of_supply numeric,
    current_label text
  )
  on conflict (mint, wallet) do update set
    token_account = excluded.token_account,
    balance_ui = excluded.balance_ui,
    pct_of_supply = excluded.pct_of_supply,
    current_label = excluded.current_label,
    coverage_state = excluded.coverage_state,
    observed_at = excluded.observed_at,
    updated_at = excluded.updated_at;

  get diagnostics inserted_count = row_count;
  perform public.reconcile_token_trade_activity(position_mint);

  update public.tokens
  set coverage = jsonb_set(jsonb_set(coverage, '{holderState}', '"complete"'::jsonb), '{holdersShown}', to_jsonb(inserted_count)),
      observed_at = snapshot_observed_at,
      updated_at = snapshot_observed_at
  where mint = position_mint;
  return inserted_count;
end;
$$;

revoke all on function public.replace_token_positions(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.replace_token_positions(text, timestamptz, jsonb) to service_role;
