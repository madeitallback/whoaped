# Fomo persistent browser production setup

## Why this exists

Privy refreshes Fomo authentication in a real browser client. A Vercel Function starts with a fresh ephemeral browser, so serializing only part of Chromium state is not a reliable production authentication strategy. Browserbase Contexts persist the complete encrypted browser profile between sessions, including cookies, localStorage, IndexedDB, sessionStorage, service workers, and browser preferences.

## Production architecture

1. Supabase Cron invokes `POST /api/leaderboard/fomo/refresh` every five minutes.
2. The existing Supabase lease permits only one collector run at a time.
3. When all three Browserbase environment variables exist, the route creates a Browserbase session attached to the dedicated persistent Context.
4. Playwright connects over CDP, opens Fomo, captures 24H/7D/30D/ALL, and persists the observations through the existing first-party RPC.
5. The Browserbase session is explicitly released with `persist: true`, rotating Privy state inside the same Context.
6. If the site invalidates the login, the collector returns an explicit reconnect-required error instead of fabricating data.

## Required secrets

Set these only in `.env.local` for one-time setup and as encrypted Vercel Production environment variables:

```text
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
BROWSERBASE_CONTEXT_ID=
```

Never prefix them with `NEXT_PUBLIC_`, commit them, print the API key in logs, or place the API key in a URL.

## One-time account connection

1. Create a Browserbase project and API key.
2. Put `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` in the ignored `.env.local`.
3. Run `pnpm fomo:browserbase:connect`.
4. The script creates a Context and opens its interactive Live View.
5. Log into the dedicated WHOAPED Fomo account and open Leaderboard.
6. The script waits for an authenticated Fomo leaderboard response, releases the session so the Context is persisted, and prints the new `BROWSERBASE_CONTEXT_ID`.
7. Add that Context ID to `.env.local` and add all three values to Vercel Production.
8. Redeploy, invoke one manual refresh, then require two consecutive scheduled successful refreshes before declaring H24 healthy.

## Operational rules

- Never run simultaneous Browserbase sessions with the same Context.
- Keep the Supabase lease enabled.
- Use a consistent Browserbase region (`us-east-1`).
- Treat `The persistent Fomo browser requires a new login` as an operational reconnect request.
- A Browserbase Context persists indefinitely, but Fomo/Privy can still revoke the underlying site session.
- The local `@sparticuz/chromium` path remains a development fallback only and must not be described as the production H24 path.

## Verification checklist

- `npm test` passes.
- `npm run build` passes.
- Browserbase setup script observes an authenticated `/v2/leaderboard` response.
- First manual cloud refresh records non-zero counts for 24H, 7D, 30D, and all.
- Two later Supabase Cron runs have `status=ready`, a newer `last_success_at`, `consecutive_failures=0`, and non-zero `last_counts`.
- `/api/leaderboard/social` serves the newest first-party Fomo snapshot.
