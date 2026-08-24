-- Append-only ownership metrics for the first-party chart. `amount_raw` stays
-- text so 64-bit SPL amounts are never rounded by JSON or JavaScript.
create table if not exists public.supply_snapshots (
  id bigint generated always as identity primary key,
  mint text not null references public.token_scans(mint) on delete cascade,
  observed_at timestamptz not null,
  total_supply_raw text not null,
  verified_fomo_supply_raw text not null,
  pre_grad_supply_raw text not null,
  post_grad_supply_raw text not null,
  holder_count integer not null,
  fomo_checked_holder_count integer not null,
  holder_index_complete boolean not null default false,
  price_usd double precision,
  liquidity_usd double precision
);

create index if not exists supply_snapshots_mint_time_idx
  on public.supply_snapshots (mint, observed_at asc);

alter table public.supply_snapshots enable row level security;
