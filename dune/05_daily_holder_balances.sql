-- WHO APED? / 05: historical daily holder balances for chart backfill.
-- Parameters: {{mint}} (Text), {{start_date}} (Date)
-- Dune's public Solana daily table is end-of-day and delayed. WHOAPED joins
-- these owner rows with its verified FOMO / buyer cohorts after import, so
-- chart points are always displayed as Dune-estimated rather than live truth.

SELECT
  CAST(day AS DATE) AS snapshot_day,
  token_balance_owner AS owner,
  SUM(token_balance) AS token_balance_ui
FROM solana_utils.daily_balances
WHERE month >= CAST(DATE_TRUNC('month', TIMESTAMP '{{start_date}}') AS DATE)
  AND day >= TIMESTAMP '{{start_date}}'
  AND token_mint_address = '{{mint}}'
  AND token_balance > 0
GROUP BY 1, 2
ORDER BY 1, 2;
