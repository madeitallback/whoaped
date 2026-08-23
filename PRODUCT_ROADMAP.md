# WHOAPED — product roadmap

## Product goal

Given any Solana token contract address (CA), answer:

1. What percentage of the current total supply is held by verified FOMO wallets?
2. Which wallets bought on the Pump.fun bonding curve before graduation?
3. Which wallets bought after graduation, and which bought both before and after?
4. Who still holds, and how have these ownership percentages changed over time?

The product is not FOMO-only. Pump.fun lifecycle and all public on-chain wallets are first-class data.

## Definitions

- **Holder**: a wallet with a positive current balance of the token. Receiving a transfer does not make it a buyer.
- **Pre-grad buyer**: a wallet with a verified Pump.fun bonding-curve buy before graduation.
- **Post-grad buyer**: a wallet with a verified acquisition after graduation. Start with PumpSwap, then cover other detected DEX routes.
- **Both**: wallet with verified buys in both lifecycle phases.
- **Verified FOMO wallet**: a wallet mapped to a FOMO identity by a trusted source, an approved curated list, or an opt-in signed proof. Unknown wallets must never be counted as FOMO.

## Core metrics

```
verified_fomo_supply_pct =
  sum(current balance of unique verified FOMO owners) / current mint supply * 100
```

Other required metrics:

- Pre-grad buyers, post-grad buyers, and both.
- Hold rate and current supply held by each buyer cohort.
- Total holder count and holder-index coverage.
- FOMO buyer count, FOMO holder count, and verified-label coverage.
- Curve progress, graduation time, and post-grad pool/venue.

## Data sources and their roles

| Source | Use | Do not use it for |
|---|---|---|
| Helius | Fresh signatures, transaction decoding, Pump curve/PumpSwap activity | Long-term complete historical balance chart by itself |
| Dune | Historical transfers, balances, trade backfill, aggregate queries | Proving an off-chain social identity such as FOMO |
| Supabase | Durable jobs, labels, current aggregates, snapshots/chart data | Chain indexing by itself |
| Dexscreener | Current price, liquidity, pools and optional display overlay | Wallet ownership history or FOMO labels |
| FomoScan v2 | Proof-verified FOMO wallet/handle identity enrichment | Holder discovery, Pump trade indexing, or price history |
| Curated labels / signed opt-in | Fallback or supplementary verified FOMO identity mapping | Inferring an unknown wallet's identity |

## Indexing flow

1. User enters a CA.
2. Respond quickly with token metadata and explicit `indexing` status; never use a zero to mean "not indexed".
3. Create durable jobs for the mint.
4. Page through every bonding-curve signature back to the first page and decode legacy Pump buys plus v2 buys.
5. Record the exact graduation transaction/time.
6. Discover the PumpSwap pool and index post-grad buys. Later add aggregator and other Solana DEX routes.
7. Build a complete current holder set, aggregate token accounts by owner, and join trusted wallet labels.
8. Persist current aggregates and immutable snapshots.
9. Continue processing safely through the background worker until every job is complete.

## Required job states

- `discover`
- `curve_history`
- `graduation`
- `post_grad_history`
- `holder_index`
- `label_enrichment`
- `snapshot`
- `completed` / `failed`

Jobs must show progress: pages scanned, transactions decoded, wallets found, and last successful update.

## Required storage changes

Existing tables are a starting point. Add:

- `token_lifecycle`: mint, creation time, graduation time/signature, PumpSwap pool(s), lifecycle status.
- `token_trades`: mint, owner, signature, timestamp, venue, side, phase (`pre_grad`/`post_grad`), amount.
- `current_holder_balances`: mint, owner, amount, balance timestamp, source completeness.
- `supply_snapshots`: mint, observed_at, total supply, verified FOMO supply, pre-grad cohort supply, post-grad cohort supply, holder counts, coverage.
- Extend `wallet_labels`: source, evidence, verified_at, confidence, expiry/revocation state.

`holder_snapshots` must become append-only for time-series use. A primary key of only `(mint, owner)` overwrites history and cannot power a chart.

## Chart

Build a first-party chart endpoint and UI, not an embedded third-party chart.

Lines:

- Verified FOMO % of total supply.
- Pre-grad Pump buyers' % of supply still held.
- Post-grad buyers' % of supply still held.
- Optional price/liquidity overlay from Dexscreener or Dune.

Controls:

- `15m`, `1h`, `1d`, `all`
- graduation marker
- visible freshness and coverage
- toggle buyer cohorts / price overlay

History plan:

- Backfill daily history with Dune balance/transfer data where available.
- Use Helius for fresh activity.
- Store own hourly snapshots from the first completed index onward.
- Mark estimated, delayed, or incomplete periods instead of presenting them as exact.

## UI requirements

- Render the token image in the token header after a successful scan. The current header uses a static fallback icon even when token metadata contains an image URL.
- Use a safe image fallback for tokens that genuinely have no image, broken image URLs, or unavailable metadata.
- Keep the result selected after choosing a search suggestion, including token name, symbol, image, and CA.
- Show `INDEXING`, `PARTIAL`, `COMPLETE`, or `FAILED` beside every metric.
- Show holder coverage as indexed/known, e.g. `1,842 / 1,842 holders`.
- Separate holders from buyers.
- Buyer filters: pre-grad, post-grad, both, still holding, verified FOMO.
- Show source and verification date on a FOMO label.
- Do not call unknown/self-custody wallets "Phantom".

## FOMO identity strategy — FomoScan v2 primary, no single-point dependency

FomoScan v2 is a working verified-identity source. The server-side key was tested successfully against both directions of lookup; do not put the key in browser code.

Use only the current official endpoints:

- `GET /v2/user/wallet/{wallet}`: wallet -> verified FOMO profile.
- `GET /v2/user/handle/{handle}`: handle -> verified wallets/profile.
- `GET /v2/user/id/{id}`: retrieve a profile by stable identity id.

Do not use the retired `/v1/identities/...` endpoints; they return `404`.

Integration behaviour:

1. Index public on-chain holders/buyers first.
2. Queue wallet-label lookups after holder/buyer discovery; never block the initial scan on thousands of HTTP calls.
3. Cache a positive lookup by wallet and stable FomoScan `id`; cache misses briefly, then retry later.
4. Respect provider rate limits with small concurrency, exponential retry on `429`, and durable job progress.
5. Store only needed public fields: stable id, handle, wallet, source, verified/observed time, and response version. Never store API keys in scan data.
6. Group wallets by stable id where the API confirms that relationship; handles can change.
7. Show label coverage, e.g. `1,240 / 1,842 holders checked`, so a partial label queue never looks like a definitive zero.

The app must still run if FomoScan is slow, unavailable, or its contract changes. The fallback label sources are:

Approved label sources:

1. Maintained curated wallet list imported by CSV/API.
2. Wallet owner opt-in: signs a nonce and associates a public identity.
3. Future approved partner API/bulk export with a clear provenance field.

Use `verified_fomo`, `possible_fomo`, and `unknown` separately. Only `verified_fomo` affects the headline FOMO %.

FomoScan enriches wallet -> handle mapping, verification timestamps, and identity grouping. It is not a replacement for Pump buyer indexing, holder balances, graduation detection, post-grad trades, or the chart. It cannot prove every FOMO wallet unless it returns a complete verified wallet dataset.

Never use passwords, browser cookies, undocumented protected endpoints, or techniques intended to bypass a provider's access controls. Public on-chain Pump/PumpSwap decoding is in scope; bypassing a private identity service is not.

## Delivery order

### Phase 0 — foundation and UI correctness

- Fix token header image rendering after selecting/scanning a token; use `token.image` with a visible fallback.
- Confirm token metadata precedence and graceful image-error handling.
- Replace misleading static copy such as top-20 coverage being presented as complete coverage.
- Make every async metric visibly pending/partial/completed.
- Add unit/UI tests for search selection, token image display, and metric state rendering.

### Phase 1 — correctness

- Finish full legacy + v2 curve backfill.
- Persist precise pre-grad buyers and graduation time.
- Add clear partial/completed UI state.

### Phase 2 — post-graduation

- Index PumpSwap buys and classify pre/post/both.
- Reconcile with Dune backfill.

### Phase 3 — all holders and labels

- Replace top-20-only scanning with a full holder index.
- Add FomoScan v2 label-enrichment jobs, caching, stable-id grouping, rate-limit handling, and provenance.
- Add curated-label/opt-in fallback sources and label provenance.
- Calculate verified FOMO and cohort supply percentages.

### Phase 4 — historical analytics

- Add append-only snapshots and chart API/UI.
- Add Dune historical balance backfill and optional price overlay.

### Phase 5 — broader coverage and hardening

- Detect other post-grad DEX/aggregator buys.
- Add retries, quotas, idempotency, monitoring, tests, and data-quality checks.

## Cost and accuracy policy

- A free-tier build can be eventually complete through queued jobs, but it will be slower for large/high-volume tokens.
- "All wallets immediately" for any large token generally needs paid indexing/RPC capacity later.
- Exact on-chain data and verified off-chain identity are distinct claims and must be displayed separately.
- Rotate any service credentials that were shared outside their intended secret store.

