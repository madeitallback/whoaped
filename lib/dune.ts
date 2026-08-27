import type { NormalizedTrade } from "./types";
import { isSolanaAddress } from "./providers";

const DUNE_API = "https://api.dune.com/api/v1";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const STABLE_SYMBOLS = new Set(["USDC", "USDT", "USDH", "PYUSD", "UXD"]);

type DuneRow = {
  block_time?: string;
  tx_id?: string;
  token_bought_mint_address?: string;
  token_bought_symbol?: string;
  token_bought_amount?: number | string;
  token_sold_mint_address?: string;
  token_sold_symbol?: string;
  token_sold_amount?: number | string;
  amount_usd?: number | string;
  outer_instruction_index?: number;
  inner_instruction_index?: number;
};

type Execution = { execution_id?: string; state?: string; error?: string };
type Result<Row> = { result?: { rows?: Row[] } };

export type DuneWalletSummary = {
  address: string;
  swaps_30d: number | string;
  last_activity: string | null;
  closed_positions: number | string;
  win_rate: number | string | null;
  capital_weighted_return: number | string | null;
  realized_pnl_usd: number | string | null;
  profit_factor?: number | string | null;
  median_winner_return?: number | string | null;
  median_loser_return?: number | string | null;
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const numeric = (value: number | string | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};
const mintOf = (mint: string | undefined, symbol: string | undefined) =>
  symbol?.toUpperCase() === "SOL" ? SOL_MINT : mint ?? symbol ?? "unknown";
const isStable = (symbol: string | undefined) => STABLE_SYMBOLS.has(symbol?.toUpperCase() ?? "");
const orderOf = (row: DuneRow) => (row.outer_instruction_index ?? 0) * 1_000_000 + (row.inner_instruction_index ?? 0);

function escapeSqlLiteral(value: string) {
  return value.replaceAll("'", "''");
}

async function executeDuneSql<Row>(sql: string, timeoutMs: number, performance: "medium" | "large" = "large") {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) throw new Error("DUNE_API_KEY is not configured.");
  const headers = { "X-DUNE-API-KEY": apiKey, "Content-Type": "application/json" };
  const started = await fetch(`${DUNE_API}/sql/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sql, performance }),
    cache: "no-store",
  });
  if (!started.ok) throw new Error(`Dune request failed (${started.status}).`);
  const execution = (await started.json()) as Execution;
  if (!execution.execution_id) throw new Error("Dune did not return an execution id.");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(1_500);
    const statusResponse = await fetch(`${DUNE_API}/execution/${execution.execution_id}/status`, { headers, cache: "no-store" });
    if (!statusResponse.ok) throw new Error(`Dune status request failed (${statusResponse.status}).`);
    const status = (await statusResponse.json()) as Execution;
    if (status.state === "QUERY_STATE_FAILED" || status.state === "QUERY_STATE_CANCELLED") {
      throw new Error(status.error || "Dune historical query failed.");
    }
    if (status.state !== "QUERY_STATE_COMPLETED") continue;
    const resultResponse = await fetch(`${DUNE_API}/execution/${execution.execution_id}/results?limit=5000`, { headers, cache: "no-store" });
    if (!resultResponse.ok) throw new Error(`Dune result request failed (${resultResponse.status}).`);
    const result = (await resultResponse.json()) as Result<Row>;
    return result.result?.rows ?? [];
  }
  throw new Error("Dune historical query is still queued.");
}

export function normalizeDuneRows(rows: DuneRow[]): NormalizedTrade[] {
  const transactions = new Map<string, DuneRow[]>();
  for (const row of rows) {
    if (!row.tx_id || !row.block_time) continue;
    const grouped = transactions.get(row.tx_id) ?? [];
    grouped.push(row);
    transactions.set(row.tx_id, grouped);
  }

  const trades: NormalizedTrade[] = [];
  for (const [signature, segments] of transactions) {
    segments.sort((a, b) => orderOf(a) - orderOf(b));
    const first = segments[0];
    const last = segments.at(-1)!;
    const timestamp = Math.floor(new Date(first.block_time!).getTime() / 1_000);
    const grossUsd = Math.max(...segments.map((row) => numeric(row.amount_usd)));

    const soldQuantity = numeric(first.token_sold_amount);
    if (soldQuantity > 0 && !isStable(first.token_sold_symbol)) {
      const token = mintOf(first.token_sold_mint_address, first.token_sold_symbol);
      trades.push({
        id: `${signature}:sell:dune:${token}`,
        signature,
        timestamp,
        token,
        symbol: first.token_sold_symbol ?? token.slice(0, 6),
        side: "sell",
        quantity: soldQuantity,
        priceUsd: grossUsd > 0 ? grossUsd / soldQuantity : null,
        grossUsd: grossUsd > 0 ? grossUsd : null,
      });
    }

    const boughtQuantity = numeric(last.token_bought_amount);
    if (boughtQuantity > 0 && !isStable(last.token_bought_symbol)) {
      const token = mintOf(last.token_bought_mint_address, last.token_bought_symbol);
      trades.push({
        id: `${signature}:buy:dune:${token}`,
        signature,
        timestamp,
        token,
        symbol: last.token_bought_symbol ?? token.slice(0, 6),
        side: "buy",
        quantity: boughtQuantity,
        priceUsd: grossUsd > 0 ? grossUsd / boughtQuantity : null,
        grossUsd: grossUsd > 0 ? grossUsd : null,
      });
    }
  }
  return trades;
}

export async function fetchDuneTrades(address: string, days = 365, timeoutMs = 45_000): Promise<NormalizedTrade[]> {
  if (!process.env.DUNE_API_KEY) return [];
  const safeAddress = escapeSqlLiteral(address);
  const safeDays = Math.max(1, Math.min(730, Math.floor(days)));
  const sql = `SELECT block_time, tx_id, token_bought_mint_address, token_bought_symbol, token_bought_amount, token_sold_mint_address, token_sold_symbol, token_sold_amount, amount_usd, outer_instruction_index, inner_instruction_index FROM dex_solana.trades WHERE trader_id = '${safeAddress}' AND block_time >= now() - interval '${safeDays}' day ORDER BY block_time DESC LIMIT 5000`;
  // The large tier is reserved for this rare fallback and cached follower batches.
  return normalizeDuneRows(await executeDuneSql<DuneRow>(sql, timeoutMs));
}

export async function fetchDuneWalletSummaries(addresses: string[], days = 90, timeoutMs = 45_000): Promise<DuneWalletSummary[]> {
  const unique = [...new Set(addresses.map((address) => address.trim()))];
  if (!unique.length) return [];
  if (unique.length > 50) throw new Error("A Dune follower batch is limited to 50 wallets.");
  if (unique.some((address) => !isSolanaAddress(address))) throw new Error("A Dune follower batch contains an invalid Solana wallet.");
  const safeDays = Math.max(30, Math.min(365, Math.floor(days)));
  const values = unique.map((address) => `('${escapeSqlLiteral(address)}')`).join(",");
  const sql = `WITH wallet_list(address) AS (VALUES ${values}), raw AS (
    SELECT t.trader_id AS address, t.block_time, t.tx_id,
      t.token_bought_mint_address, t.token_bought_symbol, t.token_bought_amount,
      t.token_sold_mint_address, t.token_sold_symbol, t.token_sold_amount, t.amount_usd
    FROM dex_solana.trades t JOIN wallet_list w ON t.trader_id = w.address
    WHERE t.block_time >= now() - interval '${safeDays}' day
  ), activity AS (
    SELECT address, max(block_time) AS last_activity,
      count(DISTINCT CASE WHEN block_time >= now() - interval '30' day THEN tx_id END) AS swaps_30d
    FROM raw GROUP BY 1
  ), legs AS (
    SELECT address, token_bought_mint_address AS token, token_bought_amount AS quantity, amount_usd, 'buy' AS side
    FROM raw WHERE token_bought_amount > 0 AND upper(coalesce(token_bought_symbol, '')) NOT IN ('USDC','USDT','USDH','PYUSD','UXD')
    UNION ALL
    SELECT address, token_sold_mint_address AS token, token_sold_amount AS quantity, amount_usd, 'sell' AS side
    FROM raw WHERE token_sold_amount > 0 AND upper(coalesce(token_sold_symbol, '')) NOT IN ('USDC','USDT','USDH','PYUSD','UXD')
  ), token_totals AS (
    SELECT address, token,
      sum(CASE WHEN side='buy' THEN quantity ELSE 0 END) AS buy_quantity,
      sum(CASE WHEN side='sell' THEN quantity ELSE 0 END) AS sell_quantity,
      sum(CASE WHEN side='buy' THEN coalesce(amount_usd,0) ELSE 0 END) AS buy_usd,
      sum(CASE WHEN side='sell' THEN coalesce(amount_usd,0) ELSE 0 END) AS sell_usd
    FROM legs WHERE token IS NOT NULL GROUP BY 1,2
  ), positions AS (
    SELECT address, token,
      buy_usd * least(1.0, sell_quantity / nullif(buy_quantity,0)) AS cost_usd,
      sell_usd * least(1.0, buy_quantity / nullif(sell_quantity,0)) AS proceeds_usd
    FROM token_totals WHERE buy_quantity > 0 AND sell_quantity > 0 AND buy_usd > 0 AND sell_usd > 0
  ), wallet_metrics AS (
    SELECT address, count(*) AS closed_positions, count_if(proceeds_usd > cost_usd) AS winning_positions,
      sum(cost_usd) AS capital_deployed_usd, sum(proceeds_usd - cost_usd) AS realized_pnl_usd,
      sum(CASE WHEN proceeds_usd > cost_usd THEN proceeds_usd - cost_usd ELSE 0 END) AS gross_profit_usd,
      abs(sum(CASE WHEN proceeds_usd < cost_usd THEN proceeds_usd - cost_usd ELSE 0 END)) AS gross_loss_usd,
      approx_percentile(CASE WHEN proceeds_usd > cost_usd THEN (proceeds_usd - cost_usd) / cost_usd END, 0.5) AS median_winner_return,
      approx_percentile(CASE WHEN proceeds_usd < cost_usd THEN (proceeds_usd - cost_usd) / cost_usd END, 0.5) AS median_loser_return
    FROM positions GROUP BY 1
  ) SELECT w.address, coalesce(a.swaps_30d,0) AS swaps_30d, a.last_activity,
    coalesce(m.closed_positions,0) AS closed_positions,
    CASE WHEN m.closed_positions > 0 THEN cast(m.winning_positions AS double) / m.closed_positions END AS win_rate,
    CASE WHEN m.capital_deployed_usd > 0 THEN m.realized_pnl_usd / m.capital_deployed_usd END AS capital_weighted_return,
    m.realized_pnl_usd,
    CASE WHEN m.gross_loss_usd > 0 THEN m.gross_profit_usd / m.gross_loss_usd END AS profit_factor,
    m.median_winner_return, m.median_loser_return
  FROM wallet_list w LEFT JOIN activity a ON a.address=w.address LEFT JOIN wallet_metrics m ON m.address=w.address
  ORDER BY w.address`;
  return executeDuneSql<DuneWalletSummary>(sql, timeoutMs);
}

export function mergeTrades(primary: NormalizedTrade[], historical: NormalizedTrade[]) {
  const merged = new Map<string, NormalizedTrade>();
  for (const trade of [...historical, ...primary]) {
    merged.set(`${trade.signature}:${trade.side}:${trade.token}`, trade);
  }
  return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
}
