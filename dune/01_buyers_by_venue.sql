-- WHO APED? / 01: Canonical historical buyer export.
-- Parameters: {{mint}} (Text), {{start_date}} (Date)
-- One output row per wallet x venue. A buy means the target mint was received.
-- `project_program_id` is a pool/program instance in Dune, so classify by project name.

WITH target_buys AS (
  SELECT
    trader_id AS wallet,
    tx_id,
    block_time,
    project,
    version_name,
    project_program_id,
    token_bought_amount AS token_amount,
    token_sold_amount AS quote_amount,
    token_sold_mint_address AS quote_mint,
    amount_usd,
    CASE
      WHEN LOWER(project) IN ('pump.fun', 'pumpfun', 'pumpdotfun') THEN 'curve'
      WHEN LOWER(project) = 'pumpswap' THEN 'pumpswap'
      ELSE 'other_dex'
    END AS venue,
    ROW_NUMBER() OVER (
      PARTITION BY trader_id, tx_id, project_program_id, outer_instruction_index, inner_instruction_index
      ORDER BY block_time
    ) AS route_row
  FROM dex_solana.trades
  WHERE block_month >= CAST(DATE_TRUNC('month', TIMESTAMP '{{start_date}}') AS DATE)
    AND block_time >= TIMESTAMP '{{start_date}}'
    AND token_bought_mint_address = '{{mint}}'
    AND trader_id IS NOT NULL
),
deduped_buys AS (
  SELECT * FROM target_buys WHERE route_row = 1
)
SELECT
  wallet,
  venue,
  MIN(block_time) AS first_buy_at,
  MAX(block_time) AS latest_buy_at,
  COUNT(DISTINCT tx_id) AS buy_tx_count,
  SUM(token_amount) AS tokens_bought,
  SUM(amount_usd) AS buy_volume_usd,
  SUM(CASE
    WHEN quote_mint = 'So11111111111111111111111111111111111111112' THEN quote_amount
    ELSE 0
  END) AS direct_sol_volume,
  ARRAY_AGG(DISTINCT project) AS dune_projects,
  ARRAY_AGG(DISTINCT project_program_id) AS program_ids
FROM deduped_buys
GROUP BY 1, 2
ORDER BY first_buy_at;
