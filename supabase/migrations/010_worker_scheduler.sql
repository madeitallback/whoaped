create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.wake_whoaped_worker()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  worker_secret text;
  request_id bigint;
begin
  if not exists (
    select 1
    from public.ingestion_jobs
    where status = 'queued'
       or (status = 'running' and locked_until < timezone('utc', now()))
  ) then
    return null;
  end if;

  select decrypted_secret
    into worker_secret
  from vault.decrypted_secrets
  where name = 'whoaped_worker_secret'
  order by updated_at desc
  limit 1;

  if worker_secret is null then
    raise warning 'WHOAPED worker secret is not provisioned in Vault';
    return null;
  end if;

  select net.http_post(
    url := 'https://whoaped-phi.vercel.app/api/worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.wake_whoaped_worker() from public, anon, authenticated;

select cron.schedule(
  'whoaped-worker-minute',
  '* * * * *',
  'select public.wake_whoaped_worker();'
);
