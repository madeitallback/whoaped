-- WHO APED? / 00: Discover how Dune has decoded a token's venues.
-- Parameters: {{mint}} (Text), {{start_date}} (Date)
-- Run this before the remaining queries and inspect `project_program_id`.

SELECT
  project,
  version,
  version_name,
  project_program_id,
  trade_source,
  COUNT(DISTINCT tx_id) AS tx_count,
  COUNT(DISTINCT trader_id) AS unique_traders,
  MIN(block_time) AS first_seen_at,
  MAX(block_time) AS last_seen_at
FROM dex_solana.trades
WHERE block_month >= CAST(DATE_TRUNC('month', TIMESTAMP '{{start_date}}') AS DATE)
  AND block_time >= TIMESTAMP '{{start_date}}'
  AND (
    token_bought_mint_address = '{{mint}}'
    OR token_sold_mint_address = '{{mint}}'
  )
GROUP BY 1, 2, 3, 4, 5
ORDER BY tx_count DESC;
