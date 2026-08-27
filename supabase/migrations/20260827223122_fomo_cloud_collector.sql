create table if not exists public.fomo_collector_state (
  id text primary key default 'primary' check (id = 'primary'),
  sealed_session text,
  status text not null default 'setup_required' check (status in ('setup_required', 'ready', 'running', 'error')),
  lease_token uuid,
  lease_until timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.fomo_collector_state (id)
values ('primary')
on conflict (id) do nothing;

alter table public.fomo_collector_state enable row level security;
revoke all on table public.fomo_collector_state from public, anon, authenticated;
grant select, insert, update on table public.fomo_collector_state to service_role;

create or replace function public.set_fomo_collector_session(new_sealed_session text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_sealed_session is null or length(new_sealed_session) not between 100 and 1000000 then
    raise exception 'invalid sealed Fomo session';
  end if;
  insert into public.fomo_collector_state (id, sealed_session, status, lease_token, lease_until, last_error, updated_at)
  values ('primary', new_sealed_session, 'ready', null, null, null, timezone('utc', now()))
  on conflict (id) do update set
    sealed_session = excluded.sealed_session,
    status = 'ready',
    lease_token = null,
    lease_until = null,
    last_error = null,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.claim_fomo_collector(lease_seconds integer default 240)
returns table (claim_token uuid, sealed_session text)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_token uuid := gen_random_uuid();
begin
  if lease_seconds not between 30 and 280 then
    raise exception 'invalid Fomo collector lease';
  end if;
  return query
  update public.fomo_collector_state
  set lease_token = next_token,
      lease_until = timezone('utc', now()) + make_interval(secs => lease_seconds),
      status = 'running',
      last_attempt_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = 'primary'
    and sealed_session is not null
    and (lease_until is null or lease_until < timezone('utc', now()))
  returning next_token, fomo_collector_state.sealed_session;
end;
$$;

create or replace function public.complete_fomo_collector(
  completed_claim_token uuid,
  next_sealed_session text,
  capture_counts jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if next_sealed_session is null or length(next_sealed_session) not between 100 and 1000000
     or jsonb_typeof(capture_counts) <> 'object' then
    raise exception 'invalid Fomo collector completion';
  end if;
  update public.fomo_collector_state
  set sealed_session = next_sealed_session,
      status = 'ready',
      lease_token = null,
      lease_until = null,
      last_success_at = timezone('utc', now()),
      last_error = null,
      consecutive_failures = 0,
      last_counts = capture_counts,
      updated_at = timezone('utc', now())
  where id = 'primary' and lease_token = completed_claim_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.fail_fomo_collector(completed_claim_token uuid, failure_message text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.fomo_collector_state
  set status = 'error',
      lease_token = null,
      lease_until = null,
      last_error = left(coalesce(failure_message, 'Unknown collector failure'), 1000),
      consecutive_failures = consecutive_failures + 1,
      updated_at = timezone('utc', now())
  where id = 'primary' and lease_token = completed_claim_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.get_fomo_collector_status()
returns table (
  status text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer,
  last_counts jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select status, last_attempt_at, last_success_at, last_error,
         consecutive_failures, last_counts, updated_at
  from public.fomo_collector_state
  where id = 'primary';
$$;

revoke all on function public.set_fomo_collector_session(text) from public, anon, authenticated;
revoke all on function public.claim_fomo_collector(integer) from public, anon, authenticated;
revoke all on function public.complete_fomo_collector(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_fomo_collector(uuid, text) from public, anon, authenticated;
revoke all on function public.get_fomo_collector_status() from public, anon, authenticated;
grant execute on function public.set_fomo_collector_session(text) to service_role;
grant execute on function public.claim_fomo_collector(integer) to service_role;
grant execute on function public.complete_fomo_collector(uuid, text, jsonb) to service_role;
grant execute on function public.fail_fomo_collector(uuid, text) to service_role;
grant execute on function public.get_fomo_collector_status() to service_role;

create or replace function public.wake_fomo_collector()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'whoaped_worker_secret'
  order by updated_at desc
  limit 1;

  if worker_secret is null then
    raise warning 'WHOAPED worker secret is not provisioned in Vault';
    return null;
  end if;

  select net.http_post(
    url := 'https://www.whoaped.xyz/api/leaderboard/fomo/refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.wake_fomo_collector() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'whoaped-fomo-collector') then
    perform cron.unschedule('whoaped-fomo-collector');
  end if;
end;
$$;

select cron.schedule(
  'whoaped-fomo-collector',
  '*/5 * * * *',
  'select public.wake_fomo_collector();'
);

notify pgrst, 'reload schema';
