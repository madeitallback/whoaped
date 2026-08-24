-- Imported public Dune daily rows. These remain separate from live RPC
-- snapshots because the source is delayed and cohort labels are joined later.
create table if not exists public.dune_holder_balance_history (
  mint text not null references public.token_scans(mint) on delete cascade,
  owner text not null,
  observed_at timestamptz not null,
  ui_amount double precision not null,
  source text not null default 'dune_daily',
  primary key (mint, owner, observed_at)
);

create index if not exists dune_holder_history_mint_time_idx
  on public.dune_holder_balance_history (mint, observed_at);

alter table public.dune_holder_balance_history enable row level security;
