# WHOAPED — Unified Product and Engineering Plan

## 0. Binding unified-product decision — 2026-08-26

WHOAPED is now the single product and this repository is the only implementation target. The former standalone WhoAped repository is a read-only donor for proven Solana indexing logic; it will not be deployed, linked, or merged wholesale. The existing WhoHeld product becomes a set of connected intelligence modules inside WHOAPED.

```text
WHOAPED
├── Token Intel      "Who aped this token, when, and who still holds?"
├── WhoHeld          Hold behavior and current ownership
├── Wallet Intel     Realized wallet performance and Hold Quality
├── Follower Edge    Quality of a Pump/Fomo profile's active followers
└── Network Edge     Repeated lead/front-run relationships between wallets
```

Canonical positioning:

> See who aped. Know who has edge.

### North-star product: the KOLscan of social trading

WHOAPED is not two dashboards placed beside each other. It is the coin-centric intelligence layer that joins public social identity, public thesis, and verified on-chain behavior:

```text
coin
├── Pump profiles that aped / still hold
├── Fomo profiles that aped / still hold
├── public thesis and source link for each identified profile
├── entry timing, current hold state, concentration, and realized behavior
└── Wallet Intel + Follower Edge + Network Edge evidence
```

The primary question on every token page is:

> Who publicly backed this coin, what did they say, do they still hold, and should their signal be trusted?

The A1 experience must provide one unified actor row, not separate Pump and Fomo tables. Each row should show:

1. Identity and source badges (`PUMP`, `FOMO`, or both).
2. Verified wallet linkage and explicit identity confidence.
3. First verified buy, last buy, current balance, percent of supply, and sold/holding state.
4. Latest relevant public thesis excerpt, its timestamp, direct source URL, and capture timestamp.
5. Wallet-performance evidence, Follower Edge, and later lead/front-run relationships.
6. Coverage state so absence of evidence is never presented as evidence of absence.

Thesis rules:

- Store only public posts/profile content obtained through an allowed public API, an authenticated user-triggered browser/extension capture, or a provider contract that permits it.
- Preserve the original URL, author/platform identifier, publication time, capture time, and a content hash.
- Separate verbatim source text from generated summaries. A summary must always link back to its evidence.
- Never invent a thesis from a wallet transaction. If no attributable public statement exists, display `No public thesis captured`.
- Version edits/deletions and label stale captures. Do not silently replace historical evidence.

Target token-page information architecture:

```text
token header + coverage/freshness
-> unified social holders strip (Pump + Fomo)
-> Who Aped timeline
-> Who Holds now
-> Thesis feed with source evidence
-> Signal quality (Wallet / Follower / Network Edge)
-> distribution and coverage diagnostics
```

Required shared records:

- `social_profiles`: canonical actor plus Pump/Fomo identifiers.
- `wallet_links`: wallet, profile, verification source, confidence, valid-from/to.
- `token_positions`: wallet-token entry/exit/current position aggregates.
- `thesis_evidence`: profile, mint, source URL, source text, published/captured timestamps, content hash.
- `thesis_summaries`: derived summary, model/version, evidence IDs; never the source of truth.
- `signal_snapshots`: versioned Wallet, Follower, and Network Edge metrics at a known timestamp.

The next product milestone after the fast Token Intel slice is therefore **Unified Social Holders + Thesis Evidence**, while the durable indexer expands buyer coverage in parallel. Pump is implemented first, then the same adapter contract is applied to Fomo without duplicating the product UI.

### Authoritative production status and execution program

This section overrides any older naming or sequencing retained later in this document for implementation history. A checked historical item means that slice was verified at the time; it does not make the unified product production-ready.

| Workstream | Current status | Production exit gate |
|---|---|---|
| One WHOAPED repository and visible web brand | Implemented | No runtime dependency on the donor repo; no obsolete public product URL |
| Wallet Intel / former WhoHeld analysis | Implemented beta | Durable storage, metric versioning, broader transaction coverage, failure telemetry |
| Pump Follower Edge | Implemented beta | Persistent graph/snapshots, refresh jobs, rate limits, multi-profile production validation |
| Fast Token Intel | Implemented beta | Never overclaims latest-signature/top-account coverage; provider failures remain isolated |
| Unified Pump + Fomo social holders | Partial | One canonical actor list with verified wallet links, source badges, confidence, and freshness |
| Public thesis evidence | Partial | Attributable source URL/text/time/hash; no inferred or invented thesis |
| Complete token lifecycle | Not implemented | Curve + PumpSwap/post-graduation indexing, resumable pagination, idempotent replay |
| Token cohort → Wallet/Follower/Network Edge | Partial | Shared canonical IDs and snapshot joins; no duplicate provider work |
| Unified WHOAPED extension | Partial/legacy | Pump and Fomo extraction, token-page injection, safe permissions, production endpoint |
| Production platform | Not ready | Database migrations, workers/queues, auth/rate limiting, monitoring, CI, backup/recovery, deploy and rollback |

#### Production implementation order

**P0 — Consolidate the product contract**

- Keep this repository as the only write target and the former WhoAped repository as read-only reference material.
- Rename remaining runtime-visible WhoHeld strings, extension package identity, storage migration labels, and documentation where they imply a separate product.
- Define canonical `profile_id`, `wallet_id`, `mint`, source IDs, confidence, coverage, freshness, and metric-version fields.
- Exit: web, API, extension, database vocabulary, and tests describe one WHOAPED product without breaking existing wallet deep links.

**P1 — Production data foundation**

- Provision Postgres/Supabase migrations for social profiles, wallet links, token positions, thesis evidence, metric snapshots, ingestion jobs, cursors, and provider events.
- Replace process-memory state with repository interfaces backed by production storage; keep deterministic fakes only in tests.
- Add idempotency keys, leases, retry/backoff, dead-letter state, checkpointed cursors, and replay-safe upserts.
- Exit: a deployment restart loses no accepted scan, follower graph, thesis evidence, or computed snapshot.

**P2 — Complete token lifecycle indexer**

- Index Pump bonding-curve buys/sells and PumpSwap/post-graduation activity.
- Resolve token-account owners, paginate beyond the fast top-account view, maintain positions from event deltas, and periodically reconcile against RPC truth.
- Exclude programs, pools, curves, ATAs, and infrastructure accounts from human-holder claims while retaining auditable labels.
- Exit: tested young, graduated, old, low-activity, high-activity, Token-2022, malformed, and provider-degraded tokens expose measured coverage and resume correctly.

**P3 — Unified Social Holders**

- Implement one platform-adapter contract for Pump and Fomo identity/profile/wallet resolution.
- Join canonical actors to token entries and current positions; allow multiple platform identities and wallets without merging them solely by display name.
- Render one actor table and timeline with Pump/Fomo/both badges, verification evidence, buy/hold state, and freshness.
- Exit: the same token page can display verified Pump and Fomo actors together without duplicate rows or unsupported identity claims.

**P4 — Thesis Evidence**

- Capture public, attributable token-related statements through authorized APIs or a user-triggered authenticated extension flow.
- Persist immutable evidence metadata and content hashes; attach generated summaries as versioned derivatives referencing evidence IDs.
- Add token relevance checks, deduplication, stale/deleted labels, abuse reporting, and `No public thesis captured` states.
- Exit: every displayed thesis is traceable to a direct source and time; removing the summarizer never removes the original evidence.

**P5 — Social signal graph**

- Join token cohorts with Wallet Intel, Follower Edge, and later Network Edge snapshots.
- Compute follower-quality and lead relationships only on explicit populations/windows with numerator, denominator, coverage, confidence, and metric version.
- Cache shared wallet computations so the same wallet is not re-indexed independently for every token/profile surface.
- Exit: every signal can be reproduced from persisted inputs and never silently falls back to screenshots or fabricated data.

**P6 — A1 web and extension experience**

- Make token CA/profile/wallet input universal, preserve URLs for every state, and design loading/partial/failed/complete experiences.
- Build the coin-centric order: social holders, aped timeline, current holds, thesis feed, signal quality, coverage diagnostics.
- Update the extension to recognize Pump and Fomo profile/token surfaces, send only user-triggered visible evidence, and open the canonical WHOAPED token/profile route.
- Exit: desktop/mobile web and extension complete the same core journey with keyboard access, responsive tables, empty/error states, and no secret in client bundles.

**P7 — Production hardening and launch**

- Validate env schemas at boot; use server-only scoped credentials and rotate any exposed development credentials before public launch.
- Add authentication where needed, per-IP/user/provider rate limits, payload limits, CSP/security headers, audit logging, and provider circuit breakers.
- Add structured logs, traces, job/provider dashboards, latency/error/coverage alerts, synthetic token/profile journeys, analytics, and cost budgets.
- Add CI gates for unit, integration, migration, contract, browser E2E, extension syntax/build, secret scanning, and production build.
- Deploy preview → staging → production with migration order, smoke tests, rollback instructions, backups, recovery drill, privacy/terms, and data-removal process.
- Exit: all launch gates below are evidenced in a release checklist and rollback has been rehearsed.

#### Non-negotiable production launch gates

- No secrets in Git history, browser bundles, extension bundles, screenshots, logs, or error payloads.
- No hardcoded wallet/profile/token path used as production logic.
- No in-memory-only accepted user data or job state.
- No `0`, `—`, or empty table that could confuse unavailable/partial data with a measured zero.
- No metric without source, population/window, numerator/denominator where applicable, coverage, freshness, confidence, and version.
- No thesis without direct attributable evidence.
- Provider timeout, 429, malformed response, partial page, and outage tests pass without poisoning unrelated modules.
- Database migrations apply forward on a clean database and a production-like snapshot; backup restore is verified.
- Critical web and extension journeys pass in staging and production, including at least ten diverse tokens and Pump/Fomo profiles.
- Monitoring, alerts, operational ownership, cost ceilings, and rollback are live before external beta invitations.

Implementation rules:

1. Preserve the working Follower Edge baseline in this repository.
2. Import only reusable domain logic from the donor repository; do not copy its UI, generic routes, in-memory scan cache, synchronous FomoScan enrichment, deployment metadata, or repository history.
3. Put token endpoints under `/api/token/*` and token pages under `/token/*` so existing wallet/profile APIs remain compatible.
4. Return token metadata and persisted partial data quickly, enqueue idempotent jobs, and expose explicit `queued`, `indexing`, `partial`, `complete`, and `failed` states.
5. Use one canonical wallet/trade/identity model so Token Intel, WhoHeld, Wallet Intel, and Follower Edge reuse the same provider work.
6. Keep Helius, Birdeye, Dune, FomoScan, Supabase service credentials, and worker secrets server-only in ignored local environment files and Vercel environment variables.
7. Keep the Windows 97 visual system and rename visible product chrome to WHOAPED only after the token vertical slice is functional.
8. Treat every percentage as a measured claim: expose numerator, denominator, time window, coverage, source, freshness, and confidence.

### Unified delivery order

```text
verified WhoHeld/Follower Edge baseline
-> shared provider and identity modules
-> fast Token Intel scan + durable status model
-> complete holder and Pump lifecycle indexing
-> asynchronous FomoScan enrichment
-> Windows 97 token page + universal input
-> buyer/holder links to Wallet Intel
-> token cohorts linked to Follower Edge
-> extension integration
-> multi-token/profile verification
```

Completion record — baseline checkpoint:

- Commit `2845daf` preserves the existing Follower Edge, Pump adapter, Dune batch work, Windows 97 UI, and extension source before token integration.
- 20 unit tests passed, TypeScript passed, and the Next.js production build passed.
- Private environment files and generated extension release bundles are ignored; a staged secret scan found no provider credentials.
- The new FomoScan credential is stored only in an ignored development environment override and is not committed.

Completion record — Token Intel vertical slice (2026-08-26):

- Added a universal token CA/Pump URL launcher and a Windows 97 token workspace at `/token/[mint]`.
- Added server-only `/api/token/scan` and `/api/token/fomo` routes with shared typed modules for Solana RPC, Pump instruction verification, current ownership, token metadata, and Fomo identity enrichment.
- The initial response is independent from FomoScan: token metadata, current top accounts, and the bounded buyer cohort render first; identity enrichment runs separately and a provider failure cannot erase the base scan.
- Buyer rows are accepted only when a known Pump buy discriminator and account layout match. Merely touching the bonding curve is never classified as a buy.
- Buyer and holder wallets deep-link into the existing Wallet Intel flow, preserving one wallet-analysis surface across modules.
- The UI exposes partial coverage instead of presenting the latest 100 bonding-curve signatures or 20 largest token accounts as lifetime/full-holder truth.
- Live verification passed for a real graduated Pump token: metadata resolved, 100 signatures were inspected, 20 current largest accounts rendered, the Fomo enrichment route completed, and the page showed no new runtime errors.
- The verified token produced no Pump buys inside the bounded latest-signature window. The empty cohort now says exactly that instead of implying the token had zero lifetime buyers.
- The Pump directory client now handles empty/non-JSON provider responses as a recoverable UI state rather than throwing an unhandled parsing error.
- Final phase gates passed: 24 tests, TypeScript, and the Next.js production build.
- Remaining coverage work: durable jobs, complete holder pagination/owner normalization, PumpSwap and post-graduation trade indexing, cohort persistence, and token-cohort links into Follower Edge.

Completion record — P0/P1 foundation checkpoint (2026-08-26):

- Runtime web copy, package metadata, server user agents, SDK errors, local store naming, and extension `0.6.0` now use WHOAPED. Old extension message/storage keys remain accepted only as migration compatibility inputs.
- The extension no longer defaults to the obsolete WhoHeld deployment; local development defaults to `http://localhost:3002` until the canonical WHOAPED production project is linked.
- Added canonical TypeScript contracts for social profiles, verified wallet links, thesis evidence, identity confidence, and persisted coverage.
- Added migration `002_unified_product_foundation.sql` for tokens, social profiles, wallet links, token positions, thesis evidence/summaries, versioned signal snapshots, leased ingestion jobs, provider events, indexes, RLS, and a `FOR UPDATE SKIP LOCKED` job claim function.
- Added a lazy, build-safe, server-only Supabase boundary accepting `SUPABASE_SECRET_KEY` with the previous service-role variable as a compatibility fallback.
- Fast token scans now persist available token/position observations and enqueue an idempotent reconciliation job without making database availability a prerequisite for the live response.
- Added authenticated `/api/worker` processing with bounded claims, leases, attempt counts, completion/failure state, and `/api/health` readiness reporting.
- Verification: 26 tests pass across eight files, TypeScript passes, extension scripts pass syntax validation, and the Next.js production build passes with the new health/worker routes.
- Operational gate still open: the migration must be applied to the selected production Supabase project and the required Vercel environment variables must be provisioned before this foundation can be called production-ready.
- Local folder rename remains intentionally deferred until this Codex task releases its Windows workspace lock; Git/product identity work continues in this sole active repository without depending on the folder name.

Completion record — P2 complete-holder slice (2026-08-26):

- Added a dedicated Helius `getProgramAccountsV2` holder index that paginates every SPL token account for a mint, rejects repeated cursors, removes zero balances, and aggregates multiple token accounts by canonical owner.
- Added a five-minute idempotency bucket for live refresh and holder snapshot jobs so concurrent scans deduplicate while later scans can refresh stale state.
- Added migration `003_atomic_holder_snapshots.sql`; complete snapshots replace positions transactionally inside Postgres and only then mark holder coverage `complete`, preventing partial pages from becoming the public source of truth.
- The authenticated worker now dispatches `holder_snapshot_v1` independently from `token_refresh_v1`, preserving per-job completion/failure state and the previous complete snapshot if provider collection fails before the atomic RPC.
- Added deterministic SPL account decoding tests. Verification now passes with 28 tests across nine files, TypeScript, extension syntax, and the Next.js production build.
- P2 remains in progress: full bonding-curve cursor history, PumpSwap/post-graduation buys/sells, trade persistence, and lifecycle reconciliation are the next slices.

Completion record — P2 verified buyer-history slice (2026-08-26):

- Added resumable 100-signature cursor jobs for the full Pump bonding-curve history and graduated-token PumpSwap history. Each worker invocation advances one bounded page and releases its lease before the next claim.
- Curve events still require the known legacy/v2 Pump buy discriminator plus matching mint, curve, and user account positions. PumpSwap events require an official buy discriminator plus the documented user and base-mint positions.
- Added `token_buy_events` as append-only verified evidence keyed by mint, signature, wallet, and venue; replaying a page is idempotent.
- Fast scans now enqueue curve history for recognized Pump tokens and PumpSwap history only when graduation is verified.
- Added PumpSwap layout rejection tests. Verification now passes with 29 tests across ten files, TypeScript, and the Next.js production build.
- Remaining P2 work: verified sell events, position deltas/reconciliation, explicit graduation evidence, non-Pump DEX coverage, and applying migrations/jobs in production.

Completion record — P3 Fomo social-actor persistence slice (2026-08-26):

- Added `token_social_actors` to join a mint, canonical social profile, verified wallet, buyer/holder/both relationship, confidence, and observation time.
- Added one transactional batch RPC that upserts Fomo profiles by stable platform identity, preserves verified wallet-link provenance, and joins the actor to the token without relying on display-name matching.
- The separate Fomo enrichment request now carries the token cohort context and persists verified identities after returning the base token scan independently.
- Fomo persistence failures remain isolated and logged server-side; they do not remove current holder/buyer data or turn unavailable identity data into a measured zero.
- Verification remains green: 29 tests across ten files, TypeScript, and the Next.js production build.
- P3 remains in progress: equivalent Pump social-profile persistence, a canonical combined actor query/API, confidence conflict handling, and the unified actor table/timeline UI.

Completion record — P3 unified actor read-model slice (2026-08-26):

- Added a canonical `TokenSocialActor` API contract and `/api/token/social?mint=...` read endpoint over persisted Pump/Fomo-neutral records.
- The repository normalizes Supabase relation responses without merging Pump and Fomo accounts merely because they share a display name or wallet.
- The token page now leads with one Social Holders table containing platform badge, profile source link, wallet, buyer/holder role, confidence, freshness, and Wallet Intel deep link.
- Fresh Fomo enrichment and persisted actors are deduplicated by platform identity plus wallet; raw on-chain buyer/holder cohorts remain separate evidence below the social table.
- Missing Supabase returns an explicit `persistence: unavailable` / `coverage: not_started` response rather than a false empty measurement.
- P3 remains in progress: persist verified Pump profile-to-wallet observations, resolve multi-wallet identity conflicts, and build the unified event timeline.

Completion record — P4 attributable thesis-evidence slice (2026-08-26):

- Added strict evidence parsing for a valid Solana mint, Pump/Fomo platform identity, same-platform HTTPS profile/source URLs, bounded visible text, explicit/contextual relevance, and sane publication timestamps.
- Added deterministic SHA-256 content hashes and migration `006_thesis_evidence_capture.sql`; its transactional RPC upserts the canonical profile and replay-safely captures immutable source evidence without creating an inferred wallet thesis.
- Added `GET/POST /api/token/thesis`: reads return explicit persistence/coverage states, while captures reject malformed or unattributable payloads and never return server credentials.
- Added an extension `0.7.0` user-triggered flow: on a Pump/Fomo coin page, selecting visible content linked to a profile offers `CAPTURE THESIS`; no content is collected automatically.
- The token page renders source text, direct original/profile links, platform, relevance, publication/capture time, and the honest `No public thesis captured` state.
- P4 remains partial until migration application, production rate limiting/auth-abuse controls, DOM fixtures for Pump/Fomo post attribution, edit/deletion tracking, relevance review, and extension production-host verification are complete.

Completion record — P3 Pump identity resolution slice (2026-08-26):

- Verified Pump's current public profile contract directly: a wallet lookup returns the matching address, stable `userId`, username, and visible follower count.
- Added a strict Pump profile parser that rejects wallet mismatches and malformed identity payloads; the resolver treats 404 as no public profile, bounds concurrency, and isolates per-wallet failures.
- Added `/api/token/pump` to resolve at most 40 measured cohort wallets per request without blocking the base token scan.
- Added migration `007_pump_social_actors.sql`; the batch RPC upserts stable Pump profiles, platform-verified wallet links, token buyer/holder relationships, confidence, and observation time replay-safely.
- Pump and Fomo enrichment now run in parallel, feed the same canonical Social Holders table, and remain visible from live results even while durable storage is unavailable.
- P3 remains partial until the historical worker resolves identities across the complete cohort, identity conflicts are reviewable, the combined actor timeline exists, and migrations are applied in production.

Completion record — WHOAPED Vercel production checkpoint (2026-08-26):

- Deployed the complete Git-tracked source through the connected Vercel plugin, not the local CLI, into the new `whoaped` project (`prj_MteriMaIwIN4U7wNTMCRp21kKf9z`).
- Production deployment `dpl_783KqFhxYqJCit62eY8SJ8uydx4W` reached `READY` with aliases `whoaped-phi.vercel.app` and `whoaped-vv13-1672.vercel.app`.
- Extension-linked production deployment `dpl_Am3b4ZN1yApUvPtbeUH84wy5WvZh` then reached `READY` on the same stable aliases; no runtime error cluster appeared in the first production verification window.
- Production smoke checks passed for the homepage, Solana RPC health, `/api/token/social`, and `/api/token/thesis`; responses preserve explicit unavailable/not-started states.
- The production health contract reported `supabaseConfigured: false`. Consequently durable jobs, actor persistence, thesis capture, and migrations remain operationally blocked even though live stateless scans work.
- Extension `0.7.1` now defaults to the canonical WHOAPED production URL while retaining localhost only as an explicit development override.
- Launch gate remains open: provision database storage, apply migrations 001–007, set scoped Vercel environment variables, generate a worker secret, redeploy, and rerun persistence/worker/token/extension smoke tests.
- The connected GitHub account is `madeitallback` and exposes both existing private repos `whoaped` and `whoheld`; this task has not destructively replaced either repo's `main` history. The active local consolidated history remains authoritative until an explicit safe GitHub migration is chosen.

Completion record — Supabase production provisioning checkpoint (2026-08-27):

- Selected the existing `follower-alpha` Supabase project (`afhbwkpqxxtvqcjfcktg`, `ca-central-1`) because it is the connected project already dedicated to this product; no unrelated Supabase project was modified.
- Applied production migrations `002` through `009`, including the unified data model, atomic holder snapshots, verified buy history, social actors, thesis evidence, Pump identities, service-role Data API access, missing foreign-key indexes, and least-privilege grants.
- All 13 public tables have RLS enabled. Supabase security advisors report only the intentional informational notices for backend-only tables with no public policy; the missing foreign-key-index findings were resolved by migration `009`.
- Deployed the allowlisted `whoaped-data` Edge Function (`0484dda0-67aa-4ce2-9e0f-f38d6c28ade4`, version 1, `ACTIVE`). It keeps the Supabase service credential inside Supabase and authenticates WHOAPED server calls with a separate generated gateway secret.
- Added gateway-mode persistence to the application while retaining direct secret-key mode for compatible environments. The local verification gate passes with 35 tests across 11 files, TypeScript, the Next.js production build, and `git diff --check`.
- Commit `646bac7` contains the secure persistence gateway, migrations `008`/`009`, environment contract, and regression test. A staged scan found no provider, gateway, or worker secret in Git.
- Vercel deployment `dpl_DjVywJSPfL94ZGUtFxPHeP1JzcT6` exposed that the connected deployment action ignored its supplied environment-variable object. The variables were subsequently saved once at the WHOAPED project level for Production, Preview, and Development, so later code deployments inherit them automatically.
- The previous environment-variable blocker is closed. The final production and worker verification is recorded below.

Completion record — durable production worker checkpoint (2026-08-27):

- Saved `SUPABASE_URL`, gateway/worker/cron/webhook secrets, and Helius/Birdeye/Dune/FomoScan credentials as masked WHOAPED Vercel project variables for Production, Preview, and Development. No secret value was committed or printed.
- Production health now returns `supabaseConfigured: true`, `supabaseReady: true`, and a reachable Solana RPC. Social and thesis endpoints return `persistence: ready`.
- A real Fartcoin scan persisted one canonical token row and 20 measured position rows and created durable refresh, holder, Pump curve-history, and PumpSwap-history jobs.
- Fixed the Edge Function's generic `204/205/304` relay so successful empty PostgREST responses are no longer misreported as gateway `500` failures. `whoaped-data` version 2 is `ACTIVE`.
- Added immediate worker wake after an accepted scan, one-job leases, an explicit 45-second complete-holder budget, honest partial fallback for oversized holder sets, reset-on-success pagination retries, repeated page continuation, and a 100-page cost boundary per history job.
- Replaced Vercel self-recursion (which the platform correctly stopped with `508`) with Supabase Vault + `pg_cron` + `pg_net`. Migration `010_worker_scheduler.sql` runs `whoaped-worker-minute` every minute only while actionable jobs exist; the worker secret stays encrypted in Vault.
- Production verification observed one active cron, five successful cron runs in the initial window, authenticated worker HTTP `200` responses, and curve history progress from 4 to 28 pages. The latest error clusters belong to superseded pre-fix deployments; the final deployment introduced no new cluster in its verification window.
- Final deployment `dpl_7p12RtpRtkMZBpEn2E8SULCbVLdG` reached `READY` on `whoaped-phi.vercel.app`. Relevant implementation commits are `1ddd789`, `9df2a2f`, `5ca3c63`, and `8e2630a`.
- Final local gate: 36 tests across 11 files, TypeScript, Next.js production build, and `git diff --check` pass. Supabase advisors report no warning/error-level security or performance finding; only intentional backend-only RLS policy notices and unused-index informational notices remain.

## 1. Product thesis

WHOAPED should connect token, wallet, and social intelligence better than Pump.fun, Fomo, or a token-only dashboard:

> Who aped this token, which buyers still hold, and are those wallets or the followers around them consistently worth following?

The product must not be another leaderboard based only on screenshots, raw PnL, follower count, or one opaque score. Every headline metric must expose its population, time window, sample size, coverage, and calculation method.

## 2. Integration order

1. **Clarify the current beta without expanding it** — finish the terminology change so users do not mistake individual wallet performance for follower quality.
2. **Pump Follower Edge live** — discover followers, map wallets, identify active/scorable traders, calculate Follower Edge, persist it, and render it on Pump.
3. **Advanced wallet/hold metrics** — improve Hold Quality and the individual Wallet Performance Beta after the first live social signal works.
4. **KOL Lead and comparison** — build network timing after the Pump follower pipeline is proven.
5. **Fomo second** — reverse engineer its authenticated/public surfaces after the Pump implementation is reliable.
6. Reuse the same normalized profile, follower, wallet, trade, and metric models for both platforms.

Pump is the first target because WhoHeld already resolves public Pump profiles and wallets. The missing piece is the profile-to-follower graph and its wallet coverage. Fomo currently resolves individual handles, but complete follower discovery may require an authenticated browser session or the extension.

### Binding execution priority

The active product priority is a working **Follower Edge on Pump**, not completing every advanced wallet metric first. When later phase numbering in this document appears to place Wallet Metrics v2 before Pump social ingestion, use this order:

```text
terminology safety
-> Pump follower discovery
-> minimal persistent social schema
-> follower-to-wallet mapping
-> active/scorable batch calculation
-> Follower Edge API
-> Pump dashboard + extension
-> production verification
-> advanced Hold Quality
-> KOL Lead
-> Fomo adapter
```

Only the minimum wallet changes required by Follower Edge happen before the Pump MVP: `active30d`, completed-position count, realized win rate, capital-weighted return, completeness, and confidence. Advanced Hold Quality does not block Follower Edge.

## 3. Current implementation

### Available today

- Pump public profile directory.
- Manual Pump, Fomo, and Solana wallet analysis.
- Helius recent Solana transaction ingestion.
- Dune 365-day historical backfill when recent data is insufficient.
- Birdeye historical price fallback.
- Generic parsing for native SOL, token swaps, and multi-hop routes.
- FIFO closed-lot matching.
- Individual wallet win rate.
- Capital-weighted realized return.
- Realized PnL.
- Median hold time.
- Recent activity detection.
- Wallet leaderboard, profile cards, watchlist, and extension prototype.

### Current Alpha Score

The current score is a wallet-performance score:

```text
score = 60% normalized win rate + 40% normalized capital-weighted return
```

It does **not** measure follower quality. It also permits a high-win-rate wallet with negative PnL to receive a respectable score. It must no longer be presented as the main WhoHeld signal.

### Missing from the original product idea

- Pump/Fomo profile-to-follower graph.
- Follower-to-wallet resolution and coverage.
- Active trader follower count.
- Profitable active follower percentage.
- Median follower win rate and return.
- Confidence/sample-quality indicators.
- Profit/capital-weighted hold metrics.
- Winner versus loser hold behavior.
- Bagholding indicators.
- KOL lead/front-run detection.
- Wallet-versus-wallet comparison.
- Persistent production storage.

## 4. Metric hierarchy

WhoHeld must separate three concepts instead of combining everything into one unexplained number.

### A. Wallet Intelligence

Metrics for one wallet's own trading behavior:

- Realized win rate.
- Capital-weighted realized return.
- Realized PnL.
- Capital deployed.
- Profit factor: gross realized wins divided by absolute gross realized losses.
- Median winning return and median losing return.
- Largest realized loss.
- Closed-position count.
- Last activity.
- Activity in the last 30 days.
- Data period and data completeness.

### B. Follower Intelligence

Metrics describing the trading quality of a profile's followers:

- Total visible followers.
- Followers with a resolved wallet.
- Active trader followers.
- Scorable active followers.
- Profitable active followers.
- **Follower Edge**.
- Median follower win rate.
- Median follower capital-weighted return.
- Distribution of follower performance.
- Wallet coverage.
- Confidence level.

### C. Network Intelligence

Metrics describing timing and relationships between wallets:

- Number of tracked KOL wallets preceded.
- Number of shared token entries.
- Median lead time.
- Lead consistency.
- Profitability of leading entries.
- Wallet-versus-wallet entry comparison.
- Common winning tokens and wallet clusters.

## 5. Canonical definitions

These definitions must be identical in the API, database, UI, extension, tests, and documentation.

### Active trader

A resolved follower wallet with at least one verified swap during the last 30 days.

This follows the original product idea. Volume and additional transaction thresholds may be displayed as quality filters, but must not silently redefine “active.”

### Scorable trader

An active trader with:

- at least 3 verified closed positions during the selected performance window;
- sufficient USD pricing to calculate realized results;
- no unresolved data issue that invalidates the calculation.

Default performance window: **90 days**. Also expose 30-day and 365-day views when data is available.

### Profitable follower

A scorable follower whose capital-weighted realized return is greater than zero during the selected window.

### Follower Edge

```text
profitable scorable active followers / all scorable active followers
```

Example:

```text
114 profitable / 184 scorable active followers = 62% Follower Edge
```

The UI must always show the numerator, denominator, performance window, wallet coverage, and confidence. Never show `62%` alone.

### Wallet coverage

```text
followers with a resolved wallet / visible followers collected
```

Coverage is not the same as confidence. Both must be shown.

### Median follower win rate

Calculate win rate independently for each scorable follower, then take the median across wallets. Do not pool all follower trades because high-frequency wallets would dominate the result.

## 6. Hold Quality

Raw average hold time must not be used. The arithmetic mean is too sensitive to extreme positions, and a long hold can indicate either conviction or bagholding.

### Required metrics

1. **Median Hold** — median duration across verified closed lots.
2. **Winner Median Hold** — median duration of profitable closed lots.
3. **Loser Median Hold** — median duration of losing closed lots.
4. **Capital-Weighted Median Hold** — weighted median using deployed capital, with per-position caps to prevent one whale position from dominating.
5. **Conviction Hold** — weighted median duration of winning lots, weighted by capped realized profit.
6. **Baghold Rate 7D** — share of losing capital held longer than seven days.
7. **Baghold Rate 30D** — share of losing capital held longer than 30 days.
8. **Patience Edge** — winner median hold divided by loser median hold, shown only with sufficient samples.

The UI should explain behavior instead of assuming that “longer is better”:

```text
Winners held       8d 4h
Losers cut         11h
Patience Edge      17.8×
30d Baghold Rate   6%
```

## 7. Score strategy

### Immediate change

- Rename the existing `Alpha Score` to **Wallet Performance Beta**.
- Add its formula, data window, closed-position count, and realized-only limitation.
- Add a warning when score and realized PnL point in opposite directions.
- Do not use it as the primary value beside a Pump/Fomo follower count.

### Primary Pump/Fomo headline

Use Follower Edge:

```text
FOLLOWER EDGE 62%
114 / 184 profitable active traders · 90D · High confidence
```

### Composite score later

Do not launch a new opaque composite until individual metrics are validated with real profiles. A future WhoHeld Signal may combine follower quality, return distribution, activity density, hold quality, network lead, and confidence, but every component must remain inspectable.

## 8. Pump.fun integration — first complete milestone

### 8.1 Discovery and mapping

- Inspect Pump's public profile and follower surfaces.
- Identify stable profile identifiers separately from display names.
- Collect only data visible to the user or available through an authorized/public source.
- Record the source URL, collection timestamp, and extraction version.
- Normalize each relationship as `profile -> follower account`.
- Resolve each follower account to a verified Solana wallet where available.
- Explicitly mark unresolved and ambiguous mappings; never guess a wallet.

### 8.2 Extension behavior

On a Pump profile page:

- Detect the current profile reliably.
- Place a compact WhoHeld metric beside the follower count without blocking native controls.
- Show loading, coverage, partial-data, protected-data, and error states.
- Open a detailed breakdown on click.
- Add a user-triggered follower collection action when server-side public discovery is unavailable.
- Never expose provider secrets in the browser or extension.

### 8.3 Backend pipeline

```text
Pump profile
  -> follower accounts
  -> verified wallet mapping
  -> 30-day activity check
  -> batch historical wallet metrics
  -> follower aggregates
  -> cached profile snapshot
  -> web dashboard + extension widget
```

Efficiency rules:

- Use Dune batch queries for many follower wallets instead of one query per click.
- Use Helius for recent activity and incremental refreshes.
- Use Birdeye only for historical price gaps not already covered by the trade source.
- Persist raw mappings, wallet metric snapshots, and aggregate snapshots.
- Refresh follower relationships less frequently than recent wallet activity.
- Deduplicate wallets shared across multiple profiles.
- Reuse cached wallet metrics across every account that the wallet follows.
- Keep expensive work out of the synchronous profile-page request.

### 8.4 Pump profile UI

Compact inline state:

```text
Follower Edge 62% · 184 wallets · High confidence
```

Expanded state:

- Profitable active traders.
- Scorable active traders.
- Active trader rate.
- Wallet coverage.
- Median follower win rate.
- Median follower weighted return.
- Performance distribution.
- Data window.
- Last refreshed time.
- Methodology link.

### 8.5 Pump acceptance criteria

- Works on arbitrary supported Pump profiles, not a hardcoded shortlist.
- Follower Edge uses active followers only.
- Active means at least one swap in the last 30 days.
- Every percentage exposes its denominator.
- Unresolved followers remain visible in coverage statistics.
- A single high-frequency wallet cannot dominate follower aggregates.
- Cached results render quickly on repeat visits.
- A cold profile shows progressive status rather than timing out.
- Extension placement works at common viewport sizes.
- No provider key or service-role key reaches client JavaScript.
- Fixture tests cover DOM changes, duplicate followers, missing wallets, inactive wallets, and insufficient history.

## 9. Persistent data model

Minimum entities:

### `social_profiles`

- `id`
- `platform`
- `platform_profile_id`
- `handle`
- `display_name`
- `profile_url`
- `primary_wallet`
- `followers_visible_count`
- `collected_at`
- `extractor_version`

### `social_followers`

- `profile_id`
- `platform_follower_id`
- `handle`
- `wallet_id`
- `wallet_resolution_status`
- `first_seen_at`
- `last_seen_at`

### `wallets`

- `id`
- `chain`
- `address`
- `verified`
- `last_activity_at`

### `wallet_metric_snapshots`

- `wallet_id`
- `window_days`
- `closed_positions`
- `win_rate`
- `capital_weighted_return`
- `realized_pnl_usd`
- `profit_factor`
- `median_hold_seconds`
- `winner_median_hold_seconds`
- `loser_median_hold_seconds`
- `conviction_hold_seconds`
- `baghold_rate_7d`
- `baghold_rate_30d`
- `active_30d`
- `data_completeness`
- `calculated_at`

### `profile_metric_snapshots`

- `profile_id`
- `window_days`
- `visible_followers`
- `wallet_mapped_followers`
- `active_followers`
- `scorable_followers`
- `profitable_followers`
- `follower_edge`
- `median_follower_win_rate`
- `median_follower_return`
- `coverage`
- `confidence`
- `calculated_at`

## 10. API targets

- `GET /api/platforms/pump/profiles/:id`
- `POST /api/platforms/pump/profiles/:id/collect-followers`
- `GET /api/platforms/pump/profiles/:id/follower-metrics`
- `POST /api/wallets/batch-refresh`
- `GET /api/wallets/:address/metrics`
- `GET /api/compare?left=:wallet&right=:wallet`
- `GET /api/widget/pump/:profileId`

Every response must include:

- metric version;
- window;
- sample counts;
- data coverage;
- last refresh;
- partial/ready/failed status;
- human-readable methodology notes.

## 11. KOL Lead and wallet comparison — after Pump follower metrics

### Lead event

Wallet A leads wallet B when A buys the same token before B within a configured window. Exclude same-block/near-simultaneous events and require repeated evidence.

### Required outputs

- Distinct KOL wallets preceded.
- Shared token entries.
- Median lead time.
- Lead consistency.
- Profitable lead percentage.
- Minimum sample and confidence.
- 5-minute, 1-hour, and 24-hour windows.

### Comparison UI

```text
Wallet A vs Wallet B
Shared entries       37
A entered first      24
B entered first       9
Unknown/tied          4
Median advantage     A by 43m
```

## 12. Fomo integration — second platform

After the Pump milestone passes its acceptance criteria:

- Inspect Fomo's public pages and authenticated browser behavior.
- Identify stable profile, follower, and verified-wallet identifiers.
- Prefer a documented/public source when available.
- If data only exists inside the authenticated UI, collect user-visible data through the extension after a user-triggered action.
- Build a Fomo extractor adapter that outputs the same normalized records as Pump.
- Reuse all wallet analytics, follower aggregation, caching, APIs, and UI components.
- Add Fomo-specific fixture tests so platform DOM/API changes do not silently corrupt metrics.

The Fomo phase should be reverse engineering of the platform adapter only. It must not create a second analytics system.

## 13. Execution backlog

### Phase 0 — metric clarity

- [x] Rename Alpha Score to Wallet Performance Beta.
- [x] Add formula, sample size, and realized-only explanation. Exact metric windows will become structured fields in the minimal Follower Edge metric pass.
- [x] Add score/PnL contradiction warning.
- [x] Change social `active` to at least one verified swap in 30 days.
- [x] Add confidence and completeness fields to Follower Edge responses.

Completion record — 2026-08-26:

- Visible web and extension terminology now distinguishes Wallet Performance Beta from Follower Edge.
- The extension default endpoint and visible product name now use WhoHeld, while the old storage key remains a migration fallback.
- The wallet card exposes the 60/40 formula, closed-lot sample, realized-only limitation, and score/PnL disagreement.
- The live social metric now uses `swaps30d >= 1` for active followers and returns explicit coverage, completeness, and confidence instead of treating missing data as zero.
- Verification: 20 unit tests passed, TypeScript passed, production build passed, and obsolete visible Alpha/Follower Alpha labels were absent from the searched application/extension sources.

### Phase 1 — wallet metric completeness

- [x] Add profit factor to the cost-bounded Pump daily batch and expose it on the board when the provider returns it.
- [x] Add median winning and losing returns to the Pump daily batch contract; retain null when no qualifying side exists.
- [ ] Add winner/loser median hold.
- [ ] Add capital-weighted median hold.
- [ ] Add Conviction Hold.
- [ ] Add 7-day and 30-day Baghold Rates.
- [ ] Add Patience Edge.
- [ ] Add unit tests for partial fills, outliers, open positions, and missing prices.

### Phase 2 — Pump follower graph

- [x] Document Pump profile/follower surfaces.
- [x] Implement stable Pump profile identifiers using the public Solana profile wallet.
- [x] Implement paginated public follower collection through the Pump adapter.
- [x] Implement follower-to-wallet resolution from Pump's verified public `address` field.
- [ ] Store mappings and coverage states.
- [x] Add extractor fixtures and change detection.

Discovery completion record — 2026-08-26:

- Confirmed Pump's public profile UI and follower button in the browser.
- Confirmed the public follower source `frontend-api-v3.pump.fun/following/followers/{wallet}` used by Pump's shipped client.
- Confirmed `offset` and `limit` pagination with different pages of up to 1,000 follower wallets.
- Confirmed live non-empty results for three unrelated profiles (`daumen`, `croakie`, and `nyhrox`) and a distinct `null`/unavailable response for `oxr`.
- Added `lib/platforms/pump/adapter.ts`, normalized cross-platform types, a sanitized fixture, five adapter tests, and `GET /api/platforms/pump/followers`.
- The adapter treats `null` as unavailable, not as zero followers; rejects format changes loudly; validates every wallet; deduplicates addresses; and exposes pagination state.
- Verification: 20 total tests passed, TypeScript passed, the local route returned three requested verified follower records with `nextOffset: 3`, and the Next production build passed.

### Phase 3 — scalable follower analytics

- [ ] Provision persistent production storage.
- [x] Build batch Dune follower query.
- [ ] Build Helius incremental activity refresh.
- [x] Deduplicate sampled wallets and cache identical profile calculations.
- [ ] Add background job states and retries.
- [ ] Materialize profile aggregate snapshots.

### Phase 4 — Follower Edge product

- [x] Calculate Follower Edge.
- [x] Calculate median follower win rate and return with equal wallet weight.
- [x] Calculate active trader counts, sample coverage, and accessible-list coverage.
- [x] Add confidence calculation.
- [x] Build the Pump dashboard widget and Pump extension injection path.
- [ ] Build detailed distribution view.
- [x] Verify the generic flow end to end on multiple unrelated Pump profiles.

Follower Edge implementation record — 2026-08-26:

- Added one batched Dune query for up to 50 unique follower wallets. It returns 30-day activity, closed-position count, realized win rate, capital-weighted return, realized PnL, and last activity per wallet.
- Defined the social denominator precisely: active means at least one swap in 30 days; scorable additionally requires at least three closed positions plus realized return and win-rate data; profitable means capital-weighted return above zero.
- `Follower Edge = profitable scorable active followers / scorable active followers`. Missing or unscorable wallets never enter the denominator and never become false losses.
- Added rank-stratified Pump sampling, equal-wallet medians, sample and accessible coverage, completeness, confidence, methodology notices, a cached API route, the dashboard card, and the Pump extension request/render path.
- Live local proof: `daumen` completed with both four- and twenty-wallet samples; `croakie` independently completed with a four-wallet sample. Both used the same generic Pump adapter and Dune batch path and returned all numerator, denominator, activity, coverage, confidence, and notice fields.
- Dune's queue exceeded the original 45-second wait once on the unrelated-profile test. The route now preserves the same execution for up to 105 seconds, exposes a real 504 only if it is still queued, and allows a 120-second server duration; the next generic `croakie` run completed successfully.
- Browser verification passed for directory → `@daumen` → live Follower Edge, automatic result scrolling, and extension-style `followerWallet` deep linking. Pump's current profile DOM also exposes the full verified profile wallet in image alt text, matching the extension's generic extractor.
- Production deployment record: GitHub commit `063d180e30ed4ce8a4f7387453b3001689da0873` deployed from `madeitallback/whoheld` `main` to Vercel deployment `dpl_HfeiKR6jdDeNM4yKzvc1RGcMw6gS` with state `READY`.
- Production browser verification passed on the canonical `whoheld-vv13-1672.vercel.app` alias: the 50-profile Pump directory rendered and a cold twenty-wallet `@daumen` Follower Edge completed with all methodology fields. The exact percentage is intentionally not frozen because the source is live.
- Vercel Authentication was disabled for the WhoHeld project so testers can open the canonical URL without an account or expiring share token. A clean connected fetch returned HTTP 200 afterward.
- Final verification: 20 tests passed across six files, TypeScript passed, extension background/content scripts passed syntax checks, `git diff --check` passed, the production build passed, and Vercel reported no runtime error clusters in the post-deploy window.

### Phase 5 — comparison and KOL Lead

- [ ] Create tracked KOL wallet registry.
- [ ] Implement token-entry timeline comparison.
- [ ] Calculate lead time and consistency.
- [ ] Build wallet comparison API and UI.
- [ ] Add confidence and anti-coincidence rules.

### Cross-cutting milestone — Windows 97 product design

- [x] Replace the web dashboard theme with a Windows 95/98-inspired desktop system.
- [x] Preserve responsive behavior and the Follower Edge information hierarchy.
- [x] Restyle the Pump/Fomo injected extension window in the same system.
- [x] Restyle the extension popup and update its Follower Edge guidance.
- [x] Package the redesigned extension as WhoHeld Companion `0.5.0`.

Design completion record — 2026-08-26:

- Replaced external webfont styling with local classic system stacks (`MS Sans Serif`, Tahoma, Lucida Console) so the visual identity does not depend on a font CDN.
- Added the Windows desktop teal surface, blue gradient title bars, beveled 3D window borders, inset fields, Explorer-style tables, LCD-like metric panels, notification dialogs, and a fixed WhoHeld taskbar.
- Kept profit/loss semantics independent from the nostalgic chrome: live/positive data remains green, losses remain red, and primary navigation uses Windows navy.
- Updated both extension surfaces: the injected Follower Edge window on Pump/Fomo and the Companion popup. No extraction, metric, or API behavior changed.
- Browser verification passed at desktop width for the Pump directory and a populated `@daumen` Follower Edge window; automatic result scrolling and all metric labels remained visible. The mobile layout continues to collapse windows and metric grids through the existing breakpoint.
- Verification: 20 tests passed, TypeScript passed, extension scripts passed syntax checks, `git diff --check` passed, and the retry production build passed after the known transient Windows/Turbopack file lock.
- Production record: GitHub commit `cc949d8a84406c011436c81f3e3b9f473ed6ce69` deployed through the connected Vercel project as `dpl_7GtzQiuk46RkiW1CUVDgoPkWck3y` with state `READY`.
- The canonical public alias rendered the Windows 97 dashboard, 50-profile Pump table, and fixed taskbar in the browser; the post-deploy Vercel runtime error scan was clean.

### Phase 6 — Fomo adapter

- [ ] Reverse engineer Fomo profile and follower surfaces.
- [ ] Implement authenticated extension collection if required.
- [ ] Normalize Fomo records into the Pump-compatible model.
- [ ] Reuse Follower Edge and network analytics.
- [ ] Verify arbitrary Fomo profiles end to end.

## 14. Definition of the first shippable social MVP

The Pump MVP is complete only when a tester can:

1. Open an arbitrary supported Pump profile.
2. See Follower Edge beside the follower count.
3. See how many followers were visible, wallet-mapped, active, scorable, and profitable.
4. Open a breakdown containing median follower win rate, return, coverage, confidence, and methodology.
5. Refresh later and receive a cached result quickly.
6. Understand partial or insufficient data without seeing a misleading score.

Only after this flow works reliably should Fomo become the active integration target.

## 15. Agent execution contract

This section is mandatory for any agent receiving this document. The agent must read this entire file before modifying code.

### Operating rules

1. Work in the phase order defined below. Do not jump to Fomo, KOL Lead, or a new composite score before the Pump Follower Edge milestone passes.
2. Implement generic platform and wallet logic. Never add a wallet address, profile handle, or DOM selector solely to fix one reported account.
3. Preserve unrelated user changes in the worktree. Inspect `git status` before editing.
4. Never place API keys in source code, tests, fixtures, browser JavaScript, commits, screenshots, or logs.
5. Keep `HELIUS_API_KEY`, `BIRDEYE_API_KEY`, `DUNE_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` server-only.
6. Keep `.env`, `.env.local`, and `.env.*` ignored. Only empty variable names belong in `.env.example`.
7. Every new metric must have a version, precise definition, deterministic test fixtures, sample count, time window, and null/insufficient-data behavior.
8. Do not silently replace missing data with zero. `null` means unknown; zero means measured and equal to zero.
9. Do not rank a partial profile above a complete profile without visibly exposing confidence and coverage.
10. Do not run one Dune execution per follower. Use persisted asynchronous batch executions.
11. Do not block an interactive HTTP request while waiting for a cold historical Dune query.
12. Do not call Birdeye once per trade without caching and concurrency limits.
13. Any extractor change requires saved fixtures and parser tests before deployment.
14. A phase is complete only when its exit gate passes. Compiling alone is not completion.
15. Use the connected GitHub/Vercel integrations for cloud actions. Do not reconnect local GitHub or Vercel CLI accounts unless the user explicitly changes that instruction.

### Required first commands

Run these read-only checks before implementation:

```powershell
git status --short
git log -5 --oneline
rg --files
rg -n "Follower Alpha|Alpha Score|follower-alpha|score|active" app lib extension README.md
```

Then establish the baseline:

```powershell
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
```

If the baseline already fails, record the failure and determine whether it predates the phase. Do not hide an existing failure by weakening a test.

## 16. Current-to-target code map

The following changes describe exactly where the present implementation must evolve.

### `lib/types.ts`

Current state:

- `WalletMetrics` contains the old generic `score`, basic realized results, one median hold value, and a boolean `active`.
- `AnalysisProfile` mixes a social profile with one analyzed wallet.

Required change:

- Keep compatibility fields temporarily so existing stored profiles still deserialize.
- Add `metricVersion`, `windowDays`, `dataCompleteness`, `confidence`, and explicit sample counts.
- Add `WalletPerformanceMetrics`, `HoldQualityMetrics`, `FollowerMetrics`, `SocialProfile`, `FollowerRelationship`, `WalletMetricSnapshot`, `ProfileMetricSnapshot`, and `RefreshJob`.
- Deprecate `metrics.score`; introduce `walletPerformanceBeta` and never call it Follower Edge.
- Replace ambiguous `active` with `active30d`.

Target type shapes:

```ts
type MetricStatus = "ready" | "partial" | "insufficient" | "queued" | "failed";
type ConfidenceLevel = "low" | "medium" | "high";

interface MetricMeta {
  metricVersion: "wallet-v2" | "follower-v1";
  windowDays: 30 | 90 | 365;
  calculatedAt: number;
  status: MetricStatus;
  dataCompleteness: number; // 0..1
  confidence: ConfidenceLevel;
}

interface HoldQualityMetrics {
  medianHoldSeconds: number | null;
  winnerMedianHoldSeconds: number | null;
  loserMedianHoldSeconds: number | null;
  capitalWeightedMedianHoldSeconds: number | null;
  convictionHoldSeconds: number | null;
  bagholdRate7d: number | null;
  bagholdRate30d: number | null;
  patienceEdge: number | null;
}

interface FollowerMetrics extends MetricMeta {
  visibleFollowers: number;
  walletMappedFollowers: number;
  activeFollowers30d: number;
  scorableFollowers: number;
  profitableFollowers: number;
  followerEdge: number | null;
  medianFollowerWinRate: number | null;
  medianFollowerReturn: number | null;
  walletCoverage: number | null;
}
```

### `lib/analysis.ts`

Current state:

- Closes purchases with FIFO lots.
- Counts closed lots when calculating win rate.
- Computes only the raw median hold.
- Defines activity as at least three recent trades and at least $300 of recent volume.
- Computes the existing 60/40 score.

Required change:

- Preserve `closeLotsFIFO` for cost-basis allocation.
- Add a position-cycle layer so partial sells do not inflate win/loss counts.
- A position cycle begins when inventory moves from zero to positive and ends when verified sells return inventory to zero within a dust tolerance.
- Aggregate all FIFO lot fragments belonging to that cycle before deciding whether the position won.
- Calculate all Wallet Intelligence and Hold Quality metrics from completed position cycles.
- Set `active30d = true` when at least one verified swap exists in the last 30 days.
- Keep volume as a separate quality attribute, not part of the definition of active.
- Move the old score into a named `calculateWalletPerformanceBeta` function.
- Return a contradiction flag when `walletPerformanceBeta >= 45` and realized PnL or capital-weighted return is negative.

Create or retain these pure functions:

```ts
closeLotsFIFO(trades)
buildClosedPositions(trades)
median(values)
weightedMedian(valuesAndWeights)
calculateHoldQuality(closedPositions)
calculateWalletPerformance(trades, windowDays)
calculateMetricConfidence(input)
```

Pure functions must not read environment variables, fetch data, or use wall-clock time without accepting `now` as an optional argument for tests.

### `lib/providers.ts`

Current state:

- Helius retrieval, Helius normalization, Birdeye pricing, and address validation live in one file.
- Recent data is fetched per wallet.

Required change:

- Keep its public exports working during migration.
- Move implementations into:
  - `lib/providers/helius.ts`
  - `lib/providers/birdeye.ts`
  - `lib/providers/solana.ts`
- Add bounded concurrency and explicit provider result metadata.
- Return `{ trades, completeness, notices, provider }`, not only an array, from new internal APIs.
- Keep `normalizeSwap` covered by current and expanded fixtures.
- Use Helius for recent/incremental data, not full follower-history fan-out.

### `lib/dune.ts`

Current state:

- Starts arbitrary SQL and waits synchronously for up to 45 seconds.
- Uses `large` performance for a single-wallet fallback.

Required change:

- Keep the single-wallet path only as a temporary manual-analysis fallback.
- Add separate asynchronous primitives:

```ts
startFollowerBatchExecution(addresses, windowDays): Promise<executionId>
getExecutionStatus(executionId): Promise<ExecutionStatus>
getExecutionRows(executionId, offset, limit): Promise<DuneRowPage>
normalizeDuneRows(rows): NormalizedTrade[]
```

- Validate every Solana address before interpolation.
- Batch 25 wallets initially; make the batch size a server-side constant.
- Persist `executionId` before polling.
- Paginate result retrieval until `next_offset` is absent.
- Store normalized results before calculating aggregates.
- On retry, poll the existing execution instead of starting another query.
- Record Dune state, submitted time, completion time, row count, credits when available, and error message.

### `lib/profile.ts`

Current state:

- Resolves and analyzes one wallet synchronously.

Required change:

- Keep manual wallet analysis as an independent Wallet Intelligence feature.
- Do not use `analyzeProfile` to calculate hundreds of followers sequentially.
- Add a separate social-profile orchestration path in `lib/jobs/profile-refresh.ts`.
- Return the renamed Wallet Performance Beta and improved metric explanations.

### `lib/store.ts`

Current state:

- Stores entire profile payloads in one JSONB column.
- Uses an ephemeral local JSON file without Supabase.
- Cannot efficiently query follower relationships, wallet reuse, jobs, or snapshots.

Required change:

- Preserve old profile/watchlist functions until the UI migration is complete.
- Add repository modules instead of expanding the current one-line REST calls:
  - `lib/repositories/social-profiles.ts`
  - `lib/repositories/followers.ts`
  - `lib/repositories/wallets.ts`
  - `lib/repositories/metrics.ts`
  - `lib/repositories/jobs.ts`
- Use typed input/output records.
- Make writes idempotent with stable unique keys.
- Production social analytics must refuse to claim persistence when Supabase is unavailable.

### `app/page.tsx`

Current state:

- Ranks analyzed individual wallets by the old score.
- Calls the result `Alpha Score` and `Wallet Alpha`.

Required change:

- Rename the current wallet metric everywhere.
- Add a separate Pump Social Intelligence section.
- Show Follower Edge as the primary profile metric.
- Always show sample, window, coverage, confidence, and refresh state.
- Add queued/progress UI for cold profiles.
- Do not sort insufficient/partial profiles as though their scores were comparable.

### `app/api/discovery/pump/route.ts`

Current state:

- Reads the public Pump directory with one large regular expression tied to current HTML serialization.

Required change:

- Move Pump extraction to `lib/platforms/pump/adapter.ts`.
- Prefer stable embedded JSON or a confirmed public data source over HTML regex.
- Keep DOM/HTML parsing as a tested fallback.
- Store a sanitized fixture for each supported response format.
- Detect a zero-result format change and return a typed extractor error; never return an empty successful directory.

### `extension/`

Current state:

- Still uses the Follower Alpha name and obsolete deployment URLs.
- Displays the individual wallet score rather than follower quality.
- Uses broad DOM text searches and fixed retry timing.

Required change:

- Rename visible product text to WhoHeld.
- Replace all obsolete endpoints with the canonical WhoHeld endpoint or a user-configured endpoint.
- Use a `MutationObserver` and route-change detection for the Pump single-page app.
- Make selectors adapter-based and covered by DOM fixtures.
- Render Follower Edge beside the native follower count when possible.
- Use the floating card only as a fallback.
- Add states: `not-collected`, `queued`, `processing`, `partial`, `ready`, `failed`.
- Add a user-triggered “Analyze followers” action when the profile has no snapshot.

## 17. Target architecture

```text
Pump page / WhoHeld web app
          |
          v
Pump platform adapter ------> social_profiles + social_followers
          |                              |
          |                              v
          |                       verified wallet set
          |                              |
          v                              v
    refresh_jobs --------------> Dune batch executions
          |                              |
          |                              v
          |                     normalized wallet trades
          |                              |
          v                              v
   job status API <----------- wallet_metric_snapshots
          |                              |
          |                              v
          +-------------------- profile_metric_snapshots
                                         |
                     +-------------------+------------------+
                     v                                      v
              Pump inline widget                      WhoHeld dashboard

Helius -> recent activity and incremental updates
Birdeye -> cached pricing gaps only
Supabase -> mappings, jobs, trades/snapshots, aggregates
Dune -> asynchronous historical batches
```

### Request behavior

Cached profile:

1. `GET follower-metrics` returns the current snapshot immediately.
2. If stale, it includes `refreshStatus: "queued"` and enqueues a refresh idempotently.
3. UI renders cached values with “refreshing” instead of blocking.

Cold profile:

1. Pump adapter resolves the stable profile.
2. API creates a refresh job and returns `202` with the job ID.
3. Follower collection stores relationships and resolution states.
4. Worker divides unique wallets into batches.
5. Each Dune execution ID is persisted.
6. Worker polls existing executions on later invocations.
7. Completed rows are normalized and wallet snapshots are calculated.
8. Profile aggregate is materialized.
9. UI polling receives `ready` and renders the metrics.

No single request is responsible for waiting through all nine steps.

## 18. Database migration specification

Create `supabase/migrations/002_social_intelligence.sql`. Do not modify migration `001` after it has shipped.

The migration must include:

- UUID primary keys with server-generated UUIDs where supported.
- Unique constraint on `(platform, platform_profile_id)`.
- Unique constraint on `(profile_id, platform_follower_id)`.
- Unique constraint on `(chain, address)`.
- Unique constraint on `(wallet_id, window_days, metric_version)` for the current snapshot strategy, or a timestamped history table plus a partial/current index.
- Unique constraint on `(profile_id, window_days, metric_version)` for profile snapshots.
- Indexes on job status, Dune execution ID, follower wallet ID, last activity, and snapshot calculation time.
- RLS enabled and browser roles revoked, following migration `001`.
- `updated_at` maintenance or explicit server writes.

Add these job tables:

```text
refresh_jobs
  id
  profile_id
  kind
  status
  current_stage
  total_items
  processed_items
  error
  created_at
  updated_at

dune_executions
  id
  refresh_job_id
  address_batch_hash
  addresses jsonb
  execution_id
  state
  submitted_at
  completed_at
  row_count
  credits
  error
```

Allowed job transitions:

```text
queued -> collecting_followers -> resolving_wallets -> querying_history
       -> calculating_wallets -> aggregating_profile -> ready

Any active state -> failed
failed -> queued only through an explicit retry
```

Repository functions must enforce transitions and idempotency. Two simultaneous requests for the same profile/window must reuse one unfinished job.

## 19. Metric algorithms — implementation details

### Weighted median

1. Remove entries with non-finite value, non-finite weight, or weight less than or equal to zero.
2. Sort by value ascending.
3. Cap each weight at the 95th percentile of positive weights before summing.
4. Return the first value whose cumulative capped weight reaches at least 50% of total capped weight.
5. Return `null` for an empty valid set.

### Closed positions

1. Sort trades by timestamp, then signature, then ID for deterministic ordering.
2. Track token inventory independently.
3. A buy when inventory is zero opens a new position cycle.
4. Additional buys add FIFO lots to the same open cycle.
5. Partial sells realize FIFO fragments but do not create separate wins.
6. When remaining inventory is below `max(1e-12, acquiredQuantity * 1e-9)`, close the cycle.
7. Sum cost, proceeds, and PnL across all fragments in the cycle.
8. Unmatched sells remain visible as data-quality events but do not create fabricated cost basis.
9. Open cycles do not affect realized win rate or realized PnL.

### Wallet win rate

```text
profitable completed position cycles / all completed position cycles
```

Break-even tolerance: treat `abs(pnlUsd) < max(0.01, costUsd * 0.0001)` as break-even. Report break-even count separately and exclude it from wins while keeping it in the completed-position denominator.

### Capital-weighted return

```text
sum(realized PnL) / sum(cost basis of completed positions)
```

Return `null` when deployed capital is zero or unknown.

### Profit factor

```text
sum(positive realized PnL) / abs(sum(negative realized PnL))
```

Return `null` when there are no losing positions; expose `noRealizedLosses: true` rather than returning infinity.

### Conviction Hold

- Include profitable completed positions only.
- Weight duration by realized profit.
- Apply the weighted-median cap rule.
- Require at least three profitable positions; otherwise return `null`.

### Baghold rates

For the first version, clearly label these as **realized losing-position baghold rates**:

```text
losing cost basis held beyond threshold / all losing cost basis
```

Open-position bagholding requires mark-to-market inventory and is a later metric. Do not mix it into the realized definition.

### Confidence v1

```text
sampleScore       = clamp(scorableFollowers / 100, 0, 1)
coverageScore     = clamp(walletCoverage / 0.50, 0, 1)
completenessScore = median data completeness of scorable wallets

confidenceScore =
  0.40 * sampleScore +
  0.30 * coverageScore +
  0.30 * completenessScore
```

Labels:

- Low: `< 0.40`
- Medium: `>= 0.40 and < 0.70`
- High: `>= 0.70`

Version this as `confidence-v1`. A later formula change must create a new version, not silently rewrite historical results.

## 20. Pump adapter procedure

The agent implementing Pump must follow this discovery gate before choosing selectors or endpoints.

### Discovery gate

1. Open the current Pump profiles directory and at least three profile pages.
2. Inspect normal navigation and pagination while signed out first.
3. Determine whether follower data is present in:
   - server-rendered HTML;
   - embedded serialized JSON;
   - a public network response;
   - authenticated-only network responses;
   - visible DOM only after interaction.
4. Record only endpoint paths, request shapes, pagination style, stable identifiers, and response field names. Do not record cookies, auth tokens, or private headers.
5. Save sanitized representative payloads/HTML under `lib/platforms/pump/fixtures/`.
6. Write the parser against fixtures before connecting it to a live route.
7. Verify the parser against at least three unrelated profiles.
8. If no authorized/public server source exists, implement user-triggered extension collection of visible follower rows.

### Adapter interface

Create `lib/platforms/types.ts`:

```ts
interface PlatformProfileRecord {
  platform: "pump" | "fomo";
  platformProfileId: string;
  handle: string | null;
  displayName: string | null;
  profileUrl: string;
  primaryWallet: string | null;
  visibleFollowerCount: number | null;
}

interface PlatformFollowerRecord {
  platformFollowerId: string;
  handle: string | null;
  profileUrl: string | null;
  verifiedWallet: string | null;
  resolutionStatus: "verified" | "unresolved" | "ambiguous";
}

interface PlatformAdapter {
  resolveProfile(input: string): Promise<PlatformProfileRecord>;
  collectFollowers(profile: PlatformProfileRecord, cursor?: string): Promise<{
    followers: PlatformFollowerRecord[];
    nextCursor: string | null;
    visibleTotal: number | null;
    source: "public-api" | "embedded-json" | "visible-dom";
  }>;
}
```

Pump-specific parsing must not leak into metric calculation or repository modules.

### Extraction failure behavior

- `200` with real empty followers is allowed only when the platform explicitly reports zero followers.
- Parser mismatch returns `502` with `code: "PUMP_FORMAT_CHANGED"`.
- Authentication requirement returns `409` with `code: "PUMP_USER_COLLECTION_REQUIRED"`.
- Rate limiting returns `429` and preserves the existing cached snapshot.
- Every failure records extractor version and stage without recording sensitive headers.

## 21. Endpoint contracts

### Start or reuse Pump refresh

`POST /api/platforms/pump/profiles/:profileId/refresh`

Response for cold/unfinished work:

```json
{
  "profileId": "uuid",
  "jobId": "uuid",
  "status": "queued",
  "stage": "collecting_followers",
  "progress": { "processed": 0, "total": null },
  "reused": false
}
```

Return `202`. If an unfinished equivalent job exists, return it with `reused: true`.

### Read refresh status

`GET /api/jobs/:jobId`

```json
{
  "jobId": "uuid",
  "status": "querying_history",
  "stage": "dune_batch_2_of_5",
  "progress": { "processed": 50, "total": 123 },
  "error": null,
  "updatedAt": 1787760000000
}
```

### Read follower metrics

`GET /api/platforms/pump/profiles/:profileId/follower-metrics?window=90`

```json
{
  "profile": {
    "platform": "pump",
    "platformProfileId": "stable-id",
    "handle": "example",
    "displayName": "Example"
  },
  "metrics": {
    "metricVersion": "follower-v1",
    "windowDays": 90,
    "visibleFollowers": 2310,
    "walletMappedFollowers": 620,
    "activeFollowers30d": 284,
    "scorableFollowers": 184,
    "profitableFollowers": 114,
    "followerEdge": 0.619565,
    "medianFollowerWinRate": 0.54,
    "medianFollowerReturn": 0.128,
    "walletCoverage": 0.2684,
    "confidence": "high",
    "dataCompleteness": 0.91,
    "calculatedAt": 1787760000000,
    "status": "ready"
  },
  "refresh": { "status": "ready", "jobId": "uuid" }
}
```

The API must reject unsupported windows, invalid IDs, invalid wallet addresses, oversized extension payloads, and unauthenticated internal worker requests.

## 22. Strict implementation sequence and exit gates

### Step 0 — Baseline and terminology

Changes:

- Rename visible Follower Alpha/Alpha Score terminology where it refers to the product or old score.
- Update extension canonical endpoint and visible name.
- Add methodology copy and contradiction warning.
- Do not change metric math yet.

Tests:

- Existing test suite.
- UI text assertion or component test for no misleading `Alpha Score` label.
- Search repository for obsolete production URLs and product strings.

Exit gate:

- Build passes.
- Existing manual wallet analysis still works.
- Old score is visibly labeled Wallet Performance Beta.

### Step 1 — Wallet metrics v2

Changes:

- Add position cycles, Hold Quality, profit factor, active30d, completeness, and confidence.
- Extend types without breaking older stored JSON payloads.
- Update wallet card and widget response.

Tests:

- One buy/one full sell.
- Multiple buys/one sell.
- One buy/multiple partial sells.
- Re-entry into the same token creates a new position cycle.
- Unmatched sell does not fabricate a win.
- Missing USD price remains unknown.
- One long outlier does not dominate the median.
- Capital/profit weighting is capped.
- Active with exactly one trade in 30 days.
- Inactive with last trade older than 30 days.
- Positive win rate but negative PnL triggers contradiction.

Exit gate:

- Pure metric fixtures pass.
- Manual production analysis returns the new fields.
- Existing wallet history still renders.

### Step 2 — Persistent social schema

Changes:

- Add migration `002_social_intelligence.sql`.
- Add repository modules and integration tests with a test/local Supabase target when available.
- Add health check that distinguishes missing config, auth failure, missing migration, and temporary network failure.

Exit gate:

- Migration is idempotent.
- Upserting the same profile/follower/wallet does not duplicate rows.
- Job transition tests pass.
- Production storage health is ready before social results claim persistence.

### Step 3 — Pump discovery and fixtures

Changes:

- Complete the discovery gate.
- Add Pump adapter, sanitized fixtures, and parser tests.
- Replace directory-route parsing with adapter output.

Exit gate:

- Three unrelated live Pump profiles resolve.
- Fixtures cover every selected source format.
- Format mismatch fails loudly and preserves cached data.

### Step 4 — Pump follower ingestion

Changes:

- Collect all authorized/public follower pages or user-visible extension rows.
- Upsert relationships and wallet-resolution states.
- Deduplicate pagination overlap.
- Add resumable cursors.

Exit gate:

- A profile refresh can stop and resume without duplicate rows.
- Visible count, collected count, mapped count, unresolved count, and ambiguous count reconcile.
- No hardcoded profile or wallet exists in production logic.

### Step 5 — Asynchronous batch analytics

Changes:

- Add job orchestration and persisted Dune execution IDs.
- Batch unique wallets.
- Poll without restarting executions.
- Paginate results and calculate wallet snapshots.
- Use Helius for recent incremental refreshes.

Exit gate:

- A cold job can survive function timeout/restart.
- Retrying does not create duplicate Dune executions for the same batch.
- Shared followers are calculated once and reused.
- Provider failure produces partial status, not false zeroes.

### Step 6 — Follower Edge aggregation

Changes:

- Filter active and scorable followers exactly as defined.
- Calculate Follower Edge, medians, coverage, completeness, and confidence.
- Persist `follower-v1` snapshots.

Tests:

- No followers.
- Followers but no wallets.
- Wallets but no active traders.
- Active but insufficient closed positions.
- Mixed profitable/unprofitable sample.
- Duplicate wallet followed through two platform accounts.
- One high-frequency trader cannot dominate medians.
- Partial provider coverage lowers completeness/confidence.

Exit gate:

- Hand-calculated fixtures match API output.
- Numerator and denominator are always returned with Follower Edge.
- Insufficient data returns `null`, never `0%`.

### Step 7 — Pump dashboard and extension

Changes:

- Add cached, cold, queued, partial, ready, and failed states.
- Place Follower Edge near follower count.
- Add expanded breakdown and methodology.
- Use MutationObserver and navigation detection.

Exit gate:

- Test on desktop and narrow/mobile viewports.
- Test direct page load and client-side navigation.
- Native follow buttons remain clickable.
- Widget never overlaps critical Pump controls.
- Extension works with the canonical WhoHeld deployment.

### Step 8 — Production verification

Changes:

- Deploy through connected GitHub/Vercel integrations.
- Verify environment variable names without printing values.
- Verify production storage and migration.
- Verify deployment protection does not prevent invited testers from opening the product.

Production checks:

1. Open WhoHeld signed out or through the intended public access mode.
2. Load a cached Pump profile.
3. Start a cold Pump profile refresh.
4. Observe progress through completion.
5. Compare displayed counts with stored counts.
6. Reload and confirm the snapshot persists.
7. Open Pump with the extension and verify inline rendering.
8. Inspect build logs, runtime errors, and `/api` status codes.

Exit gate:

- At least three unrelated Pump profiles work end to end.
- At least one profile has partial/unresolved followers and displays them correctly.
- No runtime error clusters appear during the verification window.
- Testers can access the intended URL.

### Step 9 — Fomo discovery

Begin only after Step 8 passes.

- Repeat the platform discovery gate for Fomo.
- Use the existing public wallet index only for verified wallet resolution, not as proof of follower relationships.
- If follower data requires a logged-in Fomo UI, build user-triggered extension collection.
- Implement `lib/platforms/fomo/adapter.ts` with the same interface and reuse every downstream stage.

## 23. Testing and verification commands

Minimum local verification after each implementation step:

```powershell
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
git diff --check
```

Add focused commands when test files exist:

```powershell
.\node_modules\.bin\vitest.cmd run lib/analysis.test.ts
.\node_modules\.bin\vitest.cmd run lib/follower-metrics.test.ts
.\node_modules\.bin\vitest.cmd run lib/platforms/pump
```

Required test categories:

- Unit: metric math and normalization.
- Contract: API response shapes and error codes.
- Fixture: Pump extraction formats.
- Repository: idempotency and job transitions.
- Integration: Dune start/status/results lifecycle with mocked network responses.
- Browser: Pump placement, navigation, mutation handling, and native control accessibility.
- Production smoke: cached profile, cold profile, persistence, public/tester access, and runtime logs.

Mocks must reproduce provider behavior, including pending, completed, failed, rate-limited, incomplete, and paginated responses. Never call paid providers from the regular unit-test suite.

## 24. Agent handoff report format

At the end of each phase, the implementing agent must update this file's checklist and report:

```text
Phase completed:
Files changed:
Database migrations applied:
Metric/API versions introduced:
Tests run and results:
Production verification:
Known partial-data behavior:
Provider cost/performance impact:
Remaining blocker:
Exact next phase:
Commit/deployment identifiers:
```

The agent must not say “done” if a required migration is unapplied, production is inaccessible, follower data is mocked, only one hardcoded profile works, Dune work is repeatedly restarted, or results disappear after reload.

## 25. Completion record — trending discovery + automatic Fomo thesis vertical (2026-08-27)

- Added a server-only Birdeye Solana trending adapter and cached `/api/tokens/trending` discovery endpoint.
- Added an accessible Windows 97 trending-token grid on the homepage; every card opens the canonical `/token/[mint]` workspace.
- Added strict FomoScan token-thesis parsing with token/author attribution, stable provider IDs, bounded text, timestamps, PnL/holding metadata, and deterministic content hashes.
- Added migration `011_fomoscan_thesis_ingestion.sql` with a service-role-only batch RPC that deduplicates evidence and preserves RLS.
- Token thesis reads now use a 15-minute persisted cache, refresh from FomoScan only when stale, and degrade without hiding on-chain results.
- Added a combined chronological token timeline for verified buys and attributable Pump/Fomo thesis evidence.
- Provider cost control: Birdeye is revalidated every 45 seconds; FomoScan thesis refresh is at most once per persisted token per 15 minutes. Wallet identity lookup remains scoped to the measured token cohort.
- Remaining platform-depth work: verified sell decoding/position reconciliation, a complete Fomo follower graph, and broader long-history identity coverage.

Phase completed: Trending discovery and automatic Fomo token-thesis vertical.
Files changed: homepage discovery UI, token workspace timeline, Birdeye/Fomo adapters and routes, repository persistence, Supabase gateway allowlist, migration 011, tests, environment template.
Database migrations applied: `011_fomoscan_thesis_ingestion.sql` on Supabase project `afhbwkpqxxtvqcjfcktg`; `whoaped-data` Edge Function deployed as version 3.
Metric/API versions introduced: `/api/tokens/trending`; FomoScan thesis cache/provider-state contract on `/api/token/thesis`.
Tests run and results: 40/40 Vitest tests pass; TypeScript passes; `next build` passes with 19 generated routes; `git diff --check` passes.
Production verification: `/api/health` reports Solana RPC reachable and Supabase ready; `/api/tokens/trending` returned live Birdeye Solana results; a production Fomo thesis refresh completed successfully with an honest empty result for the sampled token.
Known partial-data behavior: missing theses remain explicit and do not erase verified holder or on-chain evidence; upstream discovery errors return controlled responses.
Provider cost/performance impact: Birdeye cache 45 seconds; persisted Fomo thesis cache 15 minutes; one bounded Fomo request per stale token.
Remaining blocker: no blocker for this vertical. The three platform-depth items above remain later phases.
Exact next phase: verified sell/position reconciliation, then complete Fomo follower collection and extension-based coverage.
Commit/deployment identifiers: Git commit `381ee1b92ce0b0ae5c2ac337753bd0c3068f47ef`; Vercel deployment `dpl_H17fEeku5a3GY6By3D5a9LN2g1Cp` (`READY`).

## 26. Completion record — verified sell and position reconciliation (2026-08-27)

- Replaced buy-only historical evidence with append-only `token_trade_events` covering both `buy` and `sell`, while migrating every existing verified buy.
- Decoder inputs are pinned to the official Pump program IDL commit `3c6721a67c0b206b39130b454c8ba22a83ce972e` and PumpSwap IDL commit `2c22246b670812e2392e5f94b9543f500d6c9e15`.
- Curve and PumpSwap workers now inspect top-level and nested inner instructions, verify the official program, discriminator, mint, curve/pool account layout, and signer wallet before accepting an event.
- Exact base-token quantities are retained when the instruction variant exposes them; exact-quote variants are explicitly stored with a null token quantity instead of inventing a value.
- Added `reconcile_token_trade_activity(text)` and changed complete holder replacement to preserve historical wallets at zero balance. This prevents exited wallets and their timestamps from disappearing after a new holder snapshot.
- Position states are deterministic: `HOLDING` means positive balance with no verified sell, `TRIMMED` means positive balance after a verified sell, `EXITED` means zero balance after a verified sell, and `NOT_HELD` never falsely claims a sale.
- Added `/api/token/activity` plus the token workspace position table and chronological verified sell events.
- Historical jobs use `decoder_version: 2` and new idempotency keys, so tokens indexed by the old buy-only decoder are safely reprocessed.
- Each authorized worker wake processes up to four sequential single-job invocations using a bounded depth header. This drains the durable queue without holding multiple leases, avoids Vercel recursion-loop responses, and keeps the daily Hobby-compatible cron as a recovery wake-up.
- Migration `20260827065611_token_trade_reconciliation.sql` applied to Supabase project `afhbwkpqxxtvqcjfcktg`; 71 previous buys migrated and a 17-wallet reconciliation sample executed successfully.
- `whoaped-data` Edge Function version 4 is active. `anon` and `authenticated` have no table or RPC access; only `service_role` can read/write/reconcile.
- Supabase advisors report no warning/error findings. The INFO-only RLS-without-policy notices are intentional for service-only tables, and the new-index notices are expected before production traffic accumulates.
- Verification: 46/46 tests pass, TypeScript and the 20-route production build pass. Production commit `f58c97308c7a62fe7eda3c47c8c342597d49455d` deployed as `dpl_Hy3qTXk5Fwmv4Q3WtCsRPmvvxTQz` (`READY`). A live Fartcoin re-index returned 41 reconciled wallets and the 200-event API window contained 126 verified sells, producing 22 `EXITED` states while 19 unproven exits remained correctly labeled `NOT_HELD`.

Remaining platform-depth work after this phase: complete Fomo follower collection and broader long-history social identity coverage.

## 27. Completion record — product-first information architecture (2026-08-27)

- [x] Replace the Windows 97 web chrome with a modern, high-contrast social-intelligence interface while retaining compact data/terminal accents.
- [x] Make token exploration the primary homepage action and state the product promise in plain language: who aped, who held, why, and whether the surrounding crowd wins.
- [x] Hide empty leaderboards, watchlists, extension-import tools, and unavailable Pump directories until they contain actionable data.
- [x] Expose Pump Follower Edge directly from every successfully analyzed Pump profile, not only from a directory row.
- [x] Reorder the token workspace around verified social actors and reconciled position state before thesis and chronological evidence.
- [x] Add a token-level signal readout plus explicit counts for social actors, current/trimmed positions, verified exits, unproven exits, and public theses.
- [x] Put HOLDING/TRIMMED/EXITED/INDEXING beside every resolved Pump/Fomo actor so users can answer the core question without joining tables mentally.
- [x] Keep current-holder proof independent from historical indexing so a verified current Pump/Fomo holder is never summarized as “not holding” merely because its long-history job is incomplete.
- [x] Align the browser extension popup and injected card with the same visual hierarchy and evidence-first language; bump Companion to `0.8.0`.

Product boundary retained: Pump Follower Edge is labeled as a Pump social signal. Fomo identities and FomoScan thesis evidence are live where verified, but WHOAPED does not claim a Fomo follower graph until that relationship source is implemented and validated.

## 28. Completion record — Fomo Follower Edge vertical (2026-08-27)

- [x] Confirm from Fomo's shipped client that follower relations are session-backed; direct unauthenticated requests are also intercepted by Cloudflare. WHOAPED therefore does not impersonate a Fomo session or read browser credentials.
- [x] Add `lib/platforms/fomo/adapter.ts` using the documented FomoScan `/v2/user/handle/{handle}` contract. Stable Fomo user IDs are canonical; renamed handles are metadata, and only FomoScan-verified Solana wallets enter performance calculations.
- [x] Add a user-triggered Companion workflow on every Fomo profile: the user opens Followers, clicks `ANALYZE VISIBLE FOLLOWERS`, and only currently visible `/profile/{handle}` links are collected. Cookies, local storage, Privy tokens, and hidden DOM are never read.
- [x] Add `GET/POST /api/platforms/fomo/follower-edge`: GET reuses the latest persisted snapshot or returns `collection_required`; POST validates/deduplicates at most 100 visible handles, resolves them with bounded concurrency, and sends at most 40 verified wallets to one Dune batch.
- [x] Reuse the exact Follower Edge definition across platforms: profitable scorable active followers / scorable active followers; active is at least one verified swap in 30 days; scorable is at least three closed positions with realized weighted return and win rate.
- [x] Make platform and sampling method explicit in the metric contract. Pump remains `rank-stratified-public-sample`; Fomo is `user-triggered-visible-dom`. Missing data remains `null`/`collection_required`, never a fabricated zero.
- [x] Add `social_followers` plus an atomic `capture_fomo_follower_snapshot` RPC. It upserts canonical profiles/wallet links, persists observed relations, and writes a versioned `signal_snapshots` row in the same transaction.
- [x] Keep the new table service-only with RLS enabled, no anon/authenticated grants, a fixed function `search_path`, a targeted owner/time index, and server-only snapshot reads through the allowlisted Supabase gateway.
- [x] Enable Fomo Follower Edge from analyzed Fomo profiles on the site, add Companion collection instructions for cold profiles, and render saved numerator, denominator, visible sample, completeness, and confidence with Fomo-specific language.
- [x] Bump WHOAPED Companion to `0.9.0` and document the privacy boundary directly in the popup and injected Fomo card.
- [x] Store `FOMOSCAN_API_KEY` in the gitignored local environment; `.env.local` remains covered by `.gitignore` and is not committed.

Phase completed: Fomo follower collection, verified wallet resolution, calculation, persistence, website, and extension integration.
Files changed: Fomo adapter/service/API, generic Follower Edge contract/tests, repository, site, Companion, Supabase migration/gateway, this plan.
Database migrations applied: `012_fomo_follower_edge.sql` and `013_fomo_followers_reverse_index.sql` on `afhbwkpqxxtvqcjfcktg`; `whoaped-data` Edge Function version 5 active.
Metric/API versions introduced: existing `follower-v1-sample`, now platform-tagged; `/api/platforms/fomo/follower-edge` GET/POST.
Tests run and results: 50/50 Vitest tests pass; extension scripts pass syntax checks; Next production build passes with 21 routes.
Known partial-data behavior: a cold Fomo profile returns `collection_required`; unresolved or walletless followers remain coverage evidence but never enter the performance denominator.
Provider cost/performance impact: at most 100 FomoScan resolutions and 40 wallets in one Dune batch per explicit collection; persisted snapshots prevent repeat work on ordinary reads.
Production verification: commit `6a437c5458a93758a197e7508aaa8e6043ac82fd` deployed as `dpl_423cNkds1ugrDjZ9EqT22TVRTLVk` (`READY`). The canonical production GET resolved `@frankdegods` through FomoScan, reached Supabase, and returned the expected honest `collection_required` contract; Vercel reported no runtime errors for the route.
Remaining blocker: no implementation or deployment blocker. The first real relationship snapshot must intentionally originate from a signed-in user's visible Fomo Followers modal through Companion; it cannot be fabricated in an automated server smoke test.
Exact next phase: reload/install Companion `0.9.0`, capture one real Fomo profile snapshot, confirm its persisted reload, then expand historical identity coverage.
Commit/deployment identifiers: `6a437c5458a93758a197e7508aaa8e6043ac82fd`; `dpl_423cNkds1ugrDjZ9EqT22TVRTLVk` (`READY`).

## 29. Completion record — KOLScan product refocus (2026-08-27)

- [x] Pause extension work and reduce the web product to its two primary jobs: token intelligence and a daily cross-platform trader board.
- [x] Replace the broad marketing/analyzer homepage with a token-first command surface, concise product model, live trending discovery, and leaderboard preview.
- [x] Add `/leaderboard` and `/api/leaderboard/social` as the canonical daily social-trading board.
- [x] Integrate the official FomoScan trader leaderboard using its rolling `24h` window, realized PnL, volume, trades, followers, avatar, and platform rank.
- [x] Merge verified Pump wallet analyses into the same board without fabricating equivalence: Pump retains WHOAPED wallet-performance rank and Fomo retains official 24-hour PnL rank.
- [x] Label every row with platform, original rank, metric basis, window/sample, and missing values; never silently mix 24-hour PnL with long-window wallet performance.
- [x] Rebuild the token workspace around a two-column social cockpit: Pump/Fomo holder matrix on the left and attributable thesis feed on the right.
- [x] Put platform filters, HOLDING/TRIMMED/EXITED state, verified buy/sell counts, thesis-source count, and profile links directly on each social actor row.
- [x] Demote long wallet/position/timeline tables to supporting evidence below the core answer and remove duplicate social/thesis tables from the primary reading path.
- [x] Replace generic/Windows-style web chrome with a dense dark terminal language inspired by Pump discovery and Fomo trader dashboards: Pump mint, Fomo violet, strong white metrics, compact rows, and explicit source badges.
- [x] Add responsive layouts for token search, trending cards, leaderboard tables, actor matrix, and thesis feed.
- [x] Add explicit provider-degraded and awaiting-analysis states so an empty source is never presented as a valid zero-result board.

Metric boundary: the combined board is a cross-platform view, not a fake universal score. Fomo rows are official rolling 24-hour realized PnL; Pump rows are ranked WHOAPED wallet analyses with realized win rate, weighted return, and median hold. A future truly comparable rank requires the same measured wallet window and coverage on both platforms.

Files changed: homepage, global visual system, token workspace social cockpit, dedicated leaderboard page/component/API, Fomo leaderboard parser/adapter, tests, and this plan.
Tests run and results: 52/52 Vitest tests pass; TypeScript and the 23-route Next production build pass; visual browser verification passes for the homepage and board hierarchy.
Known partial-data behavior: local sandboxed provider calls can render explicit degraded states; production uses the configured server-only providers. Pump rows appear only after a verified Pump wallet analysis exists—no demo traders are fabricated.
Production verification: commit `68e96c0c4a3e0d0661f5648792b5f79b7188a07f` deployed as `dpl_48JwWqHhZZNvXf16ruqErkWV7i98` (`READY`) at `https://whoaped-phi.vercel.app`. The canonical API returned all 100 official Fomo 24-hour leaderboard entries, including FrankDeGods, while Birdeye returned 12 live trending Solana tokens. Opening trending token `aura` (`DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2`) rendered the new cockpit with 4 verified Pump actors/current holders and 25 attributable Fomo theses. Vercel reported no runtime errors in the post-deploy window.
Exact next phase: expand automatic Pump leaderboard coverage with a scheduled, cost-bounded wallet analysis pipeline so the combined daily board fills its Pump lane without manual analysis.

## 30. Completion record — automatic daily Pump leaderboard pipeline (2026-08-27)

- [x] Extract Pump's public profile-directory reader into a reusable, bounded server adapter with strict wallet deduplication.
- [x] Add a daily Pump refresh service that takes only the first 20 public profiles and evaluates all wallets in one Dune SQL batch over 90 days.
- [x] Convert batch summaries into stable `pump-daily:{wallet}` profiles with realized win rate, capital-weighted return, realized PnL, active-30d state, closed-position count, and the same transparent performance-score formula used elsewhere.
- [x] Keep unavailable metrics null: the Dune batch does not produce median hold, capital deployed, or raw trades, so the board never invents them.
- [x] Upsert the whole Pump cohort into the existing service-only Supabase `profiles` table in one REST write instead of one request per trader.
- [x] Deduplicate manual and daily Pump analyses by verified wallet; the newest verified analysis wins.
- [x] Add a secure `GET /api/leaderboard/pump/refresh` endpoint requiring Vercel's `Authorization: Bearer $CRON_SECRET` contract.
- [x] Add the second and final Hobby-compatible Vercel cron at `0 6 * * *`, one hour after the existing ingestion worker recovery cron.
- [x] Add stale-while-revalidate fallback to `/api/leaderboard/social`: if no automated Pump cohort is newer than 20 hours, one module-deduplicated background refresh is scheduled.
- [x] Let the client retry the social board exactly once after 12 seconds while the first Pump batch is filling; no unbounded polling or provider loop.
- [x] Add explicit UI status while Pump refreshes and keep any already verified manual Pump rows visible.

Cost envelope: one Pump directory fetch, one Dune query containing at most 20 wallets, and one Supabase batch upsert per daily refresh. The 20-hour freshness gate and in-process promise lock protect the on-demand fallback; the cron remains the canonical refresh.

Security/data boundary: no new public Supabase table or grant was introduced. Existing server-only credentials and RLS posture are reused. The cron route rejects requests unless `CRON_SECRET` matches exactly; secrets remain server-only.

Tests run and results: 55/55 Vitest tests pass, including directory parsing, null preservation, deterministic IDs, and score conversion. The 24-route Next production build passes.
Exact next phase: deploy, allow the first stale-while-revalidate batch to complete, verify persisted Pump rows on a second board request, and inspect Vercel runtime errors.

Production issue found during the first live batch: the legacy `lib/store.ts` checked only direct Supabase service-role variables, while this Vercel project intentionally uses the existing `whoaped-data` gateway. It therefore fell back to the immutable `/var/task/.data` path. The store now delegates to the canonical direct-or-gateway Supabase transport used by the rest of the application; no new credential or database path was introduced. Full tests and build pass after the correction.

Second live finding: Dune can keep the single batch queued beyond the original 42-second polling budget. Vercel Fluid Compute currently allows 300-second Hobby functions, so the cron and stale-revalidation route now use a 300-second function budget and a bounded 240-second Dune poll. Waiting on Dune is I/O time; the wallet count and query count remain unchanged. The client performs one delayed re-read after 75 seconds rather than rapid polling.

Third live finding: Dune completed, but the first upsert exposed that `profiles.id` is a UUID column. Human-readable `pump-daily:{wallet}` IDs were rejected correctly by Postgres. Daily Pump records now use deterministic version-5-shaped UUIDs derived from the verified wallet, while `dataset: pump_daily_v1` in the JSON payload carries explicit provenance and drives freshness/sample labeling.

Phase completed: automatic Pump leaderboard discovery, batch calculation, persistence, daily scheduling, stale recovery, UI refresh, and production verification.
Production verification: functional commit `49fb44c53c5cf36e1c7d8a0172a99b4114652063` deployed as `dpl_Dqkn3YvLTHAuPDcK37ZA6oRQJd1Q` (`READY`). The first successful batch persisted all 20 bounded Pump profiles. A second canonical board read returned `pump: daily_live`, 23 Pump rows total after wallet deduplication, and 100 live Fomo rows. The Pump-only view rendered verified score, win rate, weighted return, last activity, and `closed positions / 90d batch` provenance. The cron endpoint returned `401 Unauthorized` without its bearer secret, and Vercel reported no runtime errors after the successful deployment.
Provider cost/performance impact: exactly one live Pump directory request, one 20-wallet Dune batch, and one Supabase gateway upsert completed the initial refresh. Future reads remain inside the 20-hour freshness gate; the scheduled refresh runs once daily at 06:00 UTC.
Remaining honest metric gap: batch Pump median hold is null because the efficient Dune wallet-summary query does not reconstruct FIFO hold durations. Full individual analyses can still populate richer wallet evidence; the daily board does not infer missing values.
Exact next phase: improve ranking quality by adding sample-confidence thresholds and a price/profit-weighted hold-time batch metric, then connect token-level social actors to their leaderboard performance without increasing per-page provider calls.

## 31. Completion record — launch integration and ranking trust (2026-08-27)

- [x] Audit the complete user-facing surface for Pump/Fomo parity rather than treating one wallet or token as a special case.
- [x] Keep one mixed daily board while preserving the source boundary: official Fomo rolling-24h realized PnL versus verified Pump 90-day wallet performance.
- [x] Link token-level Pump actors to the daily board by verified wallet and Fomo actors by canonical handle, with no additional Dune query per token page.
- [x] Show matched performance directly beside each token actor; unmatched actors explicitly say `Not on today's ranked board` instead of displaying a fabricated zero.
- [x] Add Pump sample confidence and shrink the raw performance score toward neutral until 20 closed positions are observed, preventing tiny lucky samples from dominating the board.
- [x] Add Pump profit factor plus median winning/losing return fields to the bounded Dune summary and keep missing values null.
- [x] Version the automatic Pump dataset as `pump_daily_v2` so the first production read forces a real refresh of the new ranking contract instead of reusing stale v1 summaries.
- [x] Add Pump/Fomo thesis filters and per-source counts in the token cockpit. State the honest boundary inline: FomoScan is the automated thesis provider; Pump thesis is shown only when attributable evidence has been captured.
- [x] Publish `/methodology`, canonical metadata, Open Graph/Twitter metadata, `robots.txt`, `sitemap.xml`, and a product-native not-found state.
- [x] Extend `/api/health` with non-secret provider configuration signals for Helius, Birdeye, Dune, and FomoScan.
- [x] Use `next/image` for remote Fomo avatars and restrict the allowed image host in `next.config.mjs`.

Launch boundary: Pump and Fomo are integrated in the mixed leaderboard, token social-actor map, position view, thesis evidence model, filters, and timeline. Automatic thesis ingestion is currently deeper for Fomo because it has an attributable provider endpoint; WHOAPED deliberately does not scrape or invent a Pump user's intent. The full Fomo follower graph still requires the privacy-preserving Companion capture documented in record 28 and is not required for the token-first web launch.

Tests run before deployment: 55/55 Vitest tests pass; Next 16 production build and TypeScript pass; `git diff --check` passes.

Post-launch research, not launch blockers: exact FIFO/profit-weighted median hold in the cost-bounded Pump batch; Conviction Hold, Baghold Rate, Patience Edge, and KOL frontrun graph; broader long-history identity coverage. These need a versioned metric design and validation dataset and must not be rushed into today's product as misleading numbers.
