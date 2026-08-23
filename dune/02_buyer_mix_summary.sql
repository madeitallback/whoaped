-- WHO APED? / 02: Buyer counts and venue overlap for hero cards.
-- Parameters: {{mint}} (Text), {{start_date}} (Date)

WITH buys AS (
  SELECT DISTINCT
    trader_id AS wallet,
    tx_id,
    CASE
      WHEN LOWER(project) IN ('pump.fun', 'pumpfun', 'pumpdotfun') THEN 'curve'
      WHEN LOWER(project) = 'pumpswap' THEN 'pumpswap'
      ELSE 'other_dex'
    END AS venue
  FROM dex_solana.trades
  WHERE block_month >= CAST(DATE_TRUNC('month', TIMESTAMP '{{start_date}}') AS DATE)
    AND block_time >= TIMESTAMP '{{start_date}}'
    AND token_bought_mint_address = '{{mint}}'
    AND trader_id IS NOT NULL
),
wallet_venues AS (
  SELECT
    wallet,
    MAX(CASE WHEN venue = 'curve' THEN 1 ELSE 0 END) AS bought_curve,
    MAX(CASE WHEN venue = 'pumpswap' THEN 1 ELSE 0 END) AS bought_pumpswap,
    MAX(CASE WHEN venue = 'other_dex' THEN 1 ELSE 0 END) AS bought_other_dex
  FROM buys
  GROUP BY 1
)
SELECT
  COUNT(*) AS total_buyers,
  COUNT_IF(bought_curve = 1) AS curve_buyers,
  COUNT_IF(bought_pumpswap = 1) AS pumpswap_buyers,
  COUNT_IF(bought_other_dex = 1) AS other_dex_buyers,
  COUNT_IF(bought_curve = 1 AND bought_pumpswap = 0) AS curve_only,
  COUNT_IF(bought_curve = 0 AND bought_pumpswap = 1) AS pumpswap_only,
  COUNT_IF(bought_curve = 1 AND bought_pumpswap = 1) AS both_venues,
  COUNT_IF(bought_curve = 0 AND bought_pumpswap = 1) AS new_after_grad
FROM wallet_venues;
