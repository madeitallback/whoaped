create extension if not exists pgcrypto;

create table if not exists public.tokens (
  mint text primary key,
  name text not null,
  symbol text not null,
  image_url text,
  decimals integer not null check (decimals between 0 and 18),
  supply_ui numeric not null check (supply_ui >= 0),
  is_pump_fun boolean not null default false,
  graduated boolean,
  bonding_curve text,
  creator_wallet text,
  price_usd numeric,
  liquidity_usd numeric,
  coverage jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('pump', 'fomo')),
  platform_profile_id text not null,
  handle text,
  display_name text,
  profile_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (platform, platform_profile_id)
);

create table if not exists public.wallet_links (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.social_profiles(id) on delete cascade,
  chain text not null check (chain = 'solana'),
  wallet text not null,
  verification_source text not null check (verification_source in ('platform', 'fomoscan', 'extension', 'manual')),
  confidence text not null check (confidence in ('low', 'medium', 'high', 'verified')),
  evidence_url text,
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, wallet, valid_from)
);

create index if not exists wallet_links_wallet_idx on public.wallet_links (wallet) where valid_to is null;

create table if not exists public.token_positions (
  mint text not null references public.tokens(mint) on delete cascade,
  wallet text not null,
  token_account text,
  balance_ui numeric not null check (balance_ui >= 0),
  pct_of_supply numeric check (pct_of_supply >= 0),
  current_label text not null default 'unknown',
  first_buy_at timestamptz,
  last_buy_at timestamptz,
  last_sell_at timestamptz,
  buy_tx_count integer not null default 0 check (buy_tx_count >= 0),
  sell_tx_count integer not null default 0 check (sell_tx_count >= 0),
  coverage_state text not null check (coverage_state in ('partial', 'complete', 'failed')),
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (mint, wallet)
);

create index if not exists token_positions_wallet_idx on public.token_positions (wallet);
create index if not exists token_positions_mint_balance_idx on public.token_positions (mint, balance_ui desc);

create table if not exists public.thesis_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.social_profiles(id) on delete cascade,
  mint text not null references public.tokens(mint) on delete cascade,
  source_url text not null,
  source_text text not null,
  published_at timestamptz,
  captured_at timestamptz not null,
  content_hash text not null,
  relevance text not null check (relevance in ('explicit', 'contextual')),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (profile_id, mint, content_hash)
);

create index if not exists thesis_evidence_mint_time_idx on public.thesis_evidence (mint, published_at desc nulls last, captured_at desc);

create table if not exists public.thesis_summaries (
  id uuid primary key default gen_random_uuid(),
  mint text not null references public.tokens(mint) on delete cascade,
  profile_id uuid not null references public.social_profiles(id) on delete cascade,
  summary text not null,
  evidence_ids uuid[] not null,
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.signal_snapshots (
  id bigint generated always as identity primary key,
  subject_type text not null check (subject_type in ('wallet', 'profile', 'token_cohort', 'network_edge')),
  subject_key text not null,
  metric_name text not null,
  metric_version text not null,
  value jsonb not null,
  population jsonb not null,
  coverage jsonb not null,
  confidence text not null check (confidence in ('low', 'medium', 'high', 'verified')),
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (subject_type, subject_key, metric_name, metric_version, observed_at)
);

create table if not exists public.ingestion_jobs (
  id bigint generated always as identity primary key,
  job_type text not null,
  resource_key text not null,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  locked_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists ingestion_jobs_claim_idx on public.ingestion_jobs (status, locked_until, created_at);

create table if not exists public.provider_events (
  id bigint generated always as identity primary key,
  provider text not null,
  operation text not null,
  resource_key text,
  status text not null,
  latency_ms integer,
  http_status integer,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now())
);

create or replace function public.claim_ingestion_jobs(job_limit integer default 2, lease_seconds integer default 120)
returns setof public.ingestion_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.ingestion_jobs j
    where (j.status = 'queued' or (j.status = 'running' and j.locked_until < timezone('utc', now())))
      and j.attempt_count < j.max_attempts
    order by j.created_at asc
    for update skip locked
    limit greatest(1, least(job_limit, 4))
  )
  update public.ingestion_jobs j
  set status = 'running',
      attempt_count = j.attempt_count + 1,
      locked_until = timezone('utc', now()) + make_interval(secs => greatest(30, least(lease_seconds, 600))),
      updated_at = timezone('utc', now())
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

alter table public.tokens enable row level security;
alter table public.social_profiles enable row level security;
alter table public.wallet_links enable row level security;
alter table public.token_positions enable row level security;
alter table public.thesis_evidence enable row level security;
alter table public.thesis_summaries enable row level security;
alter table public.signal_snapshots enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.provider_events enable row level security;

revoke all on table public.tokens, public.social_profiles, public.wallet_links, public.token_positions, public.thesis_evidence, public.thesis_summaries, public.signal_snapshots, public.ingestion_jobs, public.provider_events from anon, authenticated;
revoke all on function public.claim_ingestion_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ingestion_jobs(integer, integer) to service_role;
