-- Durable lifecycle truth and append-only UI holder observations.
create table if not exists public.token_lifecycle (
  mint text primary key references public.token_scans(mint) on delete cascade,
  lifecycle_status text not null,
  graduation_signature text,
  graduation_at timestamptz,
  graduation_buyer text,
  graduation_verification text,
  updated_at timestamptz not null default now()
);

alter table public.token_lifecycle enable row level security;

-- The initial table used (mint, owner) as its primary key, which overwrote
-- history. Keep old rows and turn it into a time-series key instead.
alter table public.holder_snapshots drop constraint if exists holder_snapshots_pkey;
create unique index if not exists holder_snapshots_mint_owner_time_key
  on public.holder_snapshots (mint, owner, observed_at);
create index if not exists holder_snapshots_mint_time_idx
  on public.holder_snapshots (mint, observed_at desc);
