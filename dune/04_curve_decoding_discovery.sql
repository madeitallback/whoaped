-- WHO APED? / 04: Find any Pump.fun decoded tables available in this Dune workspace.
-- This query is a discovery step, not the production buyer query.
-- If a Pump Solana `*_call_buy` table is available, use it to backfill curve buyers
-- with its signer/user and mint/bonding_curve account columns.

SELECT table_schema, table_name
FROM information_schema.tables
WHERE LOWER(table_schema) LIKE '%solana%'
  AND (
    LOWER(table_schema) LIKE '%pump%'
    OR LOWER(table_name) LIKE '%pump%'
  )
ORDER BY 1, 2;
