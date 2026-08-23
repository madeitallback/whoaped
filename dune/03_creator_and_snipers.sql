-- WHO APED? / 03: Creator buy and first-buy timing.
-- Parameters: {{mint}} (Text), {{start_date}} (Date), {{creator}} (Text)
-- `creator` comes from the Pump bonding-curve account, not a guessed address.

WITH buys AS (
  SELECT
    trader_id AS wallet,
    tx_id,
    block_time,
    token_bought_amount,
    amount_usd,
    MIN(block_time) OVER () AS token_first_buy_at
  FROM dex_solana.trades
  WHERE block_month >= CAST(DATE_TRUNC('month', TIMESTAMP '{{start_date}}') AS DATE)
    AND block_time >= TIMESTAMP '{{start_date}}'
    AND token_bought_mint_address = '{{mint}}'
    AND trader_id IS NOT NULL
),
wallet_first_buy AS (
  SELECT
    wallet,
    MIN(block_time) AS first_buy_at,
    COUNT(DISTINCT tx_id) AS buy_tx_count,
    SUM(token_bought_amount) AS tokens_bought,
    SUM(amount_usd) AS buy_volume_usd,
    MIN(token_first_buy_at) AS token_first_buy_at
  FROM buys
  GROUP BY 1
)
SELECT
  wallet,
  first_buy_at,
  buy_tx_count,
  tokens_bought,
  buy_volume_usd,
  CASE
    WHEN wallet = '{{creator}}' THEN 'creator_bought'
    WHEN first_buy_at <= token_first_buy_at + INTERVAL '30' SECOND THEN 'sniper_0_30s'
    WHEN first_buy_at <= token_first_buy_at + INTERVAL '5' MINUTE THEN 'first_5m'
    ELSE 'later'
  END AS timing_label
FROM wallet_first_buy
ORDER BY first_buy_at;
