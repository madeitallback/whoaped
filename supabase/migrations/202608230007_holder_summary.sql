-- Keep every holder in current_holder_balances, but fetch only the top rows
-- for the UI. This view provides exact all-owner totals without forcing a
-- scan request to load tens of thousands of rows into memory.
alter table public.current_holder_balances add column if not exists rank integer;
create index if not exists current_holder_balances_mint_rank_idx
  on public.current_holder_balances (mint, rank);

create or replace view public.current_holder_summary
with (security_invoker = true)
as
select
  h.mint,
  count(*)::integer as holder_count,
  coalesce(sum(h.amount_raw::numeric), 0)::text as total_amount_raw,
  coalesce(sum(case when l.label = 'verified_fomo' and l.revoked_at is null then h.amount_raw::numeric else 0 end), 0)::text as verified_fomo_amount_raw
from public.current_holder_balances h
left join public.wallet_labels l on l.wallet = h.owner
group by h.mint;
