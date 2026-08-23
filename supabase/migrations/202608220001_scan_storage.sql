-- Run this once in Supabase Dashboard > SQL Editor.
-- The application uses a server-only `sb_secret_...` key. RLS remains enabled
-- with no browser policies, so public keys cannot read or modify scan data.

create table if not exists public.token_scans (
  mint text primary key,
  token_name text not null,
  token_symbol text not null,
  is_pumpfun boolean not null default false,
  graduated boolean,
  creator text,
  bonding_curve text,
  scan_data jsonb not null,
  last_scanned_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holder_snapshots (
  mint text not null references public.token_scans(mint) on delete cascade,
  owner text not null,
  token_account text not null,
  rank integer not null,
  ui_amount double precision not null,
  pct_of_supply double precision not null,
  label text not null,
  fomo_handle text,
  observed_at timestamptz not null,
  primary key (mint, owner)
);

create table if not exists public.token_buyers (
  mint text not null references public.token_scans(mint) on delete cascade,
  owner text not null,
  venue text not null,
  bucket text not null,
  buy_tx_count integer not null default 0,
  first_buy_at timestamptz,
  still_holds boolean not null default false,
  ui_amount_held double precision not null default 0,
  pct_of_supply double precision not null default 0,
  fomo_handle text,
  observed_at timestamptz not null,
  primary key (mint, owner, venue)
);

create table if not exists public.wallet_labels (
  wallet text primary key,
  label text not null,
  source text not null,
  handle text,
  confidence numeric(5,2),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_jobs (
  id bigint generated always as identity primary key,
  mint text not null references public.token_scans(mint) on delete cascade,
  provider text not null,
  job_type text not null,
  status text not null default 'queued',
  provider_execution_id text,
  payload jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists token_scans_last_scanned_idx on public.token_scans (last_scanned_at desc);
create index if not exists holder_snapshots_mint_rank_idx on public.holder_snapshots (mint, rank);
create index if not exists token_buyers_mint_bucket_idx on public.token_buyers (mint, bucket);
create index if not exists scan_jobs_status_idx on public.scan_jobs (status, created_at);

alter table public.token_scans enable row level security;
alter table public.holder_snapshots enable row level security;
alter table public.token_buyers enable row level security;
alter table public.wallet_labels enable row level security;
alter table public.scan_jobs enable row level security;
