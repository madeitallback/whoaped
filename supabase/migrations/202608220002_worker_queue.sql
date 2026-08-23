-- Durable worker lock for the all-token index queue.
alter table public.scan_jobs add column if not exists locked_until timestamptz;
create index if not exists scan_jobs_claim_idx on public.scan_jobs (status, locked_until, created_at);

create or replace function public.claim_scan_jobs(job_limit integer default 2)
returns table (id bigint, mint text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.scan_jobs j
    where j.status in ('queued', 'running')
      and (j.locked_until is null or j.locked_until < now())
    order by j.created_at
    for update skip locked
    limit greatest(1, least(job_limit, 4))
  )
  update public.scan_jobs j
  set locked_until = now() + interval '55 seconds'
  from candidates c
  where j.id = c.id
  returning j.id, j.mint;
end;
$$;

revoke all on function public.claim_scan_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_scan_jobs(integer) to service_role;
