# Dune queries for WHO APED?

These queries are deliberately split into discovery, buyer rows, and summary output.

## Parameters

Create these Dune parameters before saving a query:

- `mint` — Text, Solana token mint.
- `start_date` — Date. Use the token's launch date (or a few days before it) to keep the Dune scan fast.

## Run order

1. Run `00_discover_venues.sql`. It tells you the exact `project` and `project_program_id` values Dune has for this token.
2. Run `01_buyers_by_venue.sql` and save it as the canonical buyer-export query.
3. Run `02_buyer_mix_summary.sql` for the result cards.
4. Run `03_creator_and_snipers.sql` for the insider/sniper signals.
5. Optionally run `05_daily_holder_balances.sql` for delayed daily holder
   history and set its query ID as `DUNE_BALANCE_HISTORY_QUERY_ID`.

The application should use Dune for historical DEX buyers, Helius for current token balances and Pump curve fallback, and FomoScan to label the returned buyer wallets. Do not try to make Dune identify FOMO users: it has no access to FomoScan's verified identity graph.

## Important limits

- `dex_solana.trades` is not a realtime feed. Dune documents a typical 6–7 hour refresh cadence for the Solana DEX and token-transfer curated tables.
- On the current Dune schema, `project_program_id` identifies the pool/program instance, not necessarily the global Pump or PumpSwap program ID. Classify PumpSwap through `project = 'pumpswap'` and confirm it with the discovery query.
- Pump bonding-curve buys may not be present in the curated DEX table for every mint. The production scanner must retain a Helius/IDL historical fallback for `curve` buyers.
- A wallet in `trader_id` is an on-chain trader/signer. It is not proof that the wallet used Phantom, Photon, Trojan, or any other frontend.
- Start with the discovery query. If Dune does not expose Pump curve trades for a token, retain the Helius historical fallback for curve buys.
