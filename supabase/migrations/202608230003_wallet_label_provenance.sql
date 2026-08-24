-- Keep source evidence separately from the user-facing handle. `wallet` stays
-- the primary key because FomoScan identity grouping is additive metadata.
alter table public.wallet_labels add column if not exists fomo_identity_id text;
alter table public.wallet_labels add column if not exists verified_at timestamptz;
alter table public.wallet_labels add column if not exists expires_at timestamptz;
alter table public.wallet_labels add column if not exists revoked_at timestamptz;
create index if not exists wallet_labels_identity_idx on public.wallet_labels (fomo_identity_id);
