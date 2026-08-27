create table if not exists public.token_buy_events (
  mint text not null references public.tokens(mint) on delete cascade,
  signature text not null,
  wallet text not null,
  venue text not null check (venue in ('curve', 'pumpswap')),
  phase text not null check (phase in ('pre_grad', 'post_grad')),
  occurred_at timestamptz,
  decoder_version integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (mint, signature, wallet, venue)
);

create index if not exists token_buy_events_wallet_idx on public.token_buy_events (wallet, occurred_at desc);
create index if not exists token_buy_events_mint_time_idx on public.token_buy_events (mint, occurred_at asc nulls last);

alter table public.token_buy_events enable row level security;
revoke all on table public.token_buy_events from anon, authenticated;
