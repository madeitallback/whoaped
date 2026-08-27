create or replace function public.replace_token_positions(
  position_mint text,
  snapshot_observed_at timestamptz,
  positions jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if not exists (select 1 from public.tokens where mint = position_mint) then
    raise exception 'Token % must exist before replacing positions', position_mint;
  end if;

  delete from public.token_positions where mint = position_mint;

  insert into public.token_positions (
    mint, wallet, token_account, balance_ui, pct_of_supply, current_label,
    coverage_state, observed_at, updated_at
  )
  select
    position_mint,
    row.wallet,
    row.token_account,
    row.balance_ui,
    row.pct_of_supply,
    coalesce(row.current_label, 'unknown'),
    'complete',
    snapshot_observed_at,
    snapshot_observed_at
  from jsonb_to_recordset(positions) as row(
    wallet text,
    token_account text,
    balance_ui numeric,
    pct_of_supply numeric,
    current_label text
  );

  get diagnostics inserted_count = row_count;
  update public.tokens
  set coverage = jsonb_set(jsonb_set(coverage, '{holderState}', '"complete"'::jsonb), '{holdersShown}', to_jsonb(inserted_count)),
      observed_at = snapshot_observed_at,
      updated_at = snapshot_observed_at
  where mint = position_mint;
  return inserted_count;
end;
$$;

revoke all on function public.replace_token_positions(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.replace_token_positions(text, timestamptz, jsonb) to service_role;
