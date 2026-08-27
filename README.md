# WHOAPED

On-chain wallet and social-trading intelligence. The current wallet analysis uses Helius for recent Solana activity, Dune for historical backfill, and Birdeye for historical USD pricing gaps.

## Start locally

1. Copy `.env.example` to `.env.local`.
2. Add `HELIUS_API_KEY`, `BIRDEYE_API_KEY`, and a random `WEBHOOK_SECRET`.
3. Install dependencies: `pnpm install`.
4. Run: `pnpm dev`.
5. Open the URL printed by Next (in this workspace, `http://localhost:3002`) and paste a public Solana wallet.

## Test directly on Pump/Fomo

1. Open `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked** and select the `extension` folder.
2. The extension defaults to `https://whoaped-phi.vercel.app`; override the App URL with `http://localhost:3002` only for local development.
3. On `pump.fun/profile/<wallet>`, the extension reads the public wallet already present in the profile URL and renders a live **WHOAPED** card directly in the profile. No redirect is needed.
4. On `fomo.family/profile/<handle>`, the extension renders the same inline card only when the profile itself exposes a public Solana explorer link. A handle alone is not a verifiable wallet mapping.
5. On a visible Pump/Fomo leaderboard, click **Queue visible profiles** to send a pilot shortlist to the dashboard. Pump wallets can be batch ranked; Fomo profiles appear in a queue until a public mapping is available.

## Security and data boundaries

- Keys are server-only. Do not add them to the client or commit `.env.local`.
- Pump/Fomo follower relationships are not part of the current production metric yet. The Pump-first Follower Edge implementation is specified in `planrenew.md`.
- The Fomo flow accepts a handle for labeling and a wallet that the user independently verified.
- The Pump/Fomo page integration is enabled only for this authorized pilot; it reads visible profile links and never uses hidden endpoints.

## Partner-ready paths

- `POST /api/analyze` runs a manual wallet analysis.
- `GET /api/profiles/:id` reads a saved analysis.
- `GET /api/widget/:id` provides a compact native-integration payload.
- `POST /api/webhooks/helius` verifies `Authorization: WEBHOOK_SECRET`; attach it only to user-watchlisted wallets.

The current Wallet Performance Beta is an individual-wallet estimate: 60% normalized realized win rate and 40% normalized capital-weighted return. It is not Follower Edge. EVM analysis and WHOAPED follower analytics remain gated on an authorized social-graph source.

## Production storage and workers

Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`), and `WORKER_SECRET` in Vercel. Apply the SQL files in `supabase/migrations` in filename order. The service credential and worker secret are server-only; they are never exposed to the extension or browser client.

- `GET /api/health` checks Solana RPC and the production schema without exposing credentials.
- `POST /api/worker` requires `Authorization: Bearer <WORKER_SECRET>` and claims a small leased job batch.
- Token scans render even if persistence is temporarily unavailable; the response and UI retain explicit partial coverage.
