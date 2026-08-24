-- Complete current balances are stored separately from UI samples. The worker
-- replaces this derived snapshot atomically at the application level only
-- after it has fetched a whole mint, so an RPC failure leaves the prior data.
create table if not exists public.current_holder_balances (
  mint text not null references public.token_scans(mint) on delete cascade,
  owner text not null,
  token_account text not null,
  amount_raw text not null,
  observed_at timestamptz not null,
  primary key (mint, owner)
);

create index if not exists current_holder_balances_mint_amount_idx
  on public.current_holder_balances (mint, amount_raw desc);

alter table public.current_holder_balances enable row level security;
