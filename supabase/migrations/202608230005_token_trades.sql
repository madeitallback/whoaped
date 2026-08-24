-- Immutable decoded buys make cohort calculations and graduation evidence
-- inspectable independently from the current aggregate table.
create table if not exists public.token_trades (
  mint text not null references public.token_scans(mint) on delete cascade,
  signature text not null,
  owner text not null,
  block_time timestamptz,
  venue text not null,
  side text not null,
  phase text not null,
  primary key (mint, signature, owner)
);

create index if not exists token_trades_mint_phase_time_idx
  on public.token_trades (mint, phase, block_time);

alter table public.token_trades enable row level security;
