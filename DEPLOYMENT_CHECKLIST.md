# WHOAPED deployment checklist

The app code is private and all provider keys stay server-side. Before relying
on complete holders, historical charts, or durable FOMO labels, do these once.

## 1. Apply Supabase migrations in order

In Supabase Dashboard → SQL Editor, run these files in this exact order:

1. `supabase/migrations/202608220001_scan_storage.sql`
2. `supabase/migrations/202608220002_worker_queue.sql`
3. `supabase/migrations/202608230001_holder_index.sql`
4. `supabase/migrations/202608230002_supply_snapshots.sql`
5. `supabase/migrations/202608230003_wallet_label_provenance.sql`
6. `supabase/migrations/202608230004_lifecycle_and_append_only_holders.sql`
7. `supabase/migrations/202608230005_token_trades.sql`
8. `supabase/migrations/202608230006_dune_holder_history.sql`
9. `supabase/migrations/202608230007_holder_summary.sql`

## 2. Set private Vercel environment variables

Set these for Production and Preview. Do not use `NEXT_PUBLIC_` for any of
them: `HELIUS_API_KEY`, `FOMOSCAN_API_KEY`, `DUNE_API_KEY`,
`DUNE_BUYERS_QUERY_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and
`WORKER_SECRET`.

`SUPABASE_SECRET_KEY` must be a currently active Supabase **server/service**
key for this project. The `/api/health` response must report
`"supabaseReady": true`; `supabaseConfigured: true` alone only means that a
value was provided, not that it works.

For a delayed 90-day daily balance backfill, save
`dune/05_daily_holder_balances.sql` as a private Dune query and set its ID in
`DUNE_BALANCE_HISTORY_QUERY_ID`. Leave it unset to avoid Dune balance-query
usage; fresh first-party snapshots still work after the full holder index.

## 3. Let the worker run

Keep the existing Supabase Cron invocation of `POST /api/worker` with
`Authorization: Bearer <WORKER_SECRET>`. The worker advances curve history,
complete holder scans, and verified FOMO label batches without a browser tab
being open.

## 4. Verify

- Open `/api/health` after deploy: RPC reachable and `supabaseReady: true`.
- Scan a small Pump.fun token first. Its holder index will change from
  `queued/running` to `completed`.
- The FOMO percentage remains explicitly a lower bound while labels index.
- The ownership chart begins after snapshots are persisted; it never invents
  an unavailable historical line.
