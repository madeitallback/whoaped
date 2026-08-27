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
  where fomo_collector_state.id = 'primary'
    and fomo_collector_state.sealed_session is not null
    and (fomo_collector_state.lease_until is null or fomo_collector_state.lease_until < timezone('utc', now()))
  returning next_token, fomo_collector_state.sealed_session;
end;
$$;

revoke all on function public.claim_fomo_collector(integer) from public, anon, authenticated;
grant execute on function public.claim_fomo_collector(integer) to service_role;

notify pgrst, 'reload schema';
