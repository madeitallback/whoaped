alter table public.fomo_collector_state
  add column if not exists bootstrap_token_hash text,
  add column if not exists bootstrap_expires_at timestamptz;

create or replace function public.consume_fomo_collector_bootstrap_token(candidate_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if candidate_token_hash is null or candidate_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.fomo_collector_state
  set bootstrap_token_hash = null,
      bootstrap_expires_at = null,
      updated_at = timezone('utc', now())
  where id = 'primary'
    and bootstrap_token_hash = candidate_token_hash
    and bootstrap_expires_at > timezone('utc', now());
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.consume_fomo_collector_bootstrap_token(text) from public, anon, authenticated;
grant execute on function public.consume_fomo_collector_bootstrap_token(text) to service_role;

notify pgrst, 'reload schema';
