-- Keep source evidence separately from the user-facing handle. `wallet` stays
-- the primary key because FomoScan identity grouping is additive metadata.
alter table public.wallet_labels add column if not exists fomo_identity_id text;
alter table public.wallet_labels add column if not exists verified_at timestamptz;
alter table public.wallet_labels add column if not exists expires_at timestamptz;
alter table public.wallet_labels add column if not exists revoked_at timestamptz;
create index if not exists wallet_labels_identity_idx on public.wallet_labels (fomo_identity_id);

create or replace view public.current_verified_fomo_labels
with (security_invoker = true)
as
select h.mint, l.wallet, l.source, l.handle, l.confidence, l.fomo_identity_id
from public.current_holder_balances h
join public.wallet_labels l on l.wallet = h.owner
where l.label = 'verified_fomo'
  and l.revoked_at is null;
