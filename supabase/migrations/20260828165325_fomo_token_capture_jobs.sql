-- The Fomo collector owns the persistent Browserbase Context. Token captures are
-- claimed separately so the generic on-chain worker can never open that Context.
create or replace function public.claim_fomo_token_capture_job()
returns setof public.ingestion_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.ingestion_jobs j
    where j.job_type = 'fomo_token_capture_v1'
      and (j.status = 'queued' or (j.status = 'running' and j.locked_until < timezone('utc', now())))
      and j.attempt_count < j.max_attempts
    order by j.created_at asc
    for update skip locked
    limit 1
  )
  update public.ingestion_jobs j
  set status = 'running', attempt_count = j.attempt_count + 1,
      locked_until = timezone('utc', now()) + interval '240 seconds', updated_at = timezone('utc', now())
  from candidate c where j.id = c.id returning j.*;
end;
$$;

revoke all on function public.claim_fomo_token_capture_job() from public, anon, authenticated;
grant execute on function public.claim_fomo_token_capture_job() to service_role;
