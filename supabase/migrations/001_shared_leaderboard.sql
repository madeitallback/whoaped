create table if not exists public.profiles (
  id uuid primary key,
  source text not null check (source in ('manual', 'pump', 'fomo')),
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);

create table if not exists public.watchlist (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;
alter table public.watchlist enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.watchlist from anon, authenticated;
