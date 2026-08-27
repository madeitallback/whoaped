import { describe, expect, it } from "vitest";
import { mergeTrades, normalizeDuneRows } from "./dune";

describe("Dune Solana trade normalization", () => {
  it("collapses a multi-hop route into the wallet input and final output", () => {
    const trades = normalizeDuneRows([
      { block_time: "2026-08-01T10:00:00Z", tx_id: "tx", token_sold_symbol: "USDC", token_sold_mint_address: "usdc", token_sold_amount: 100, token_bought_symbol: "SOL", token_bought_amount: 0.5, amount_usd: 100, outer_instruction_index: 1, inner_instruction_index: 1 },
      { block_time: "2026-08-01T10:00:00Z", tx_id: "tx", token_sold_symbol: "SOL", token_sold_amount: 0.5, token_bought_symbol: "BONK", token_bought_mint_address: "bonk", token_bought_amount: 1000, amount_usd: 99, outer_instruction_index: 1, inner_instruction_index: 2 },
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ signature: "tx", side: "buy", token: "bonk", quantity: 1000, grossUsd: 100 });
  });

  it("emits both non-stable legs for token-to-token swaps", () => {
    const trades = normalizeDuneRows([
      { block_time: "2026-08-01T10:00:00Z", tx_id: "tx2", token_sold_symbol: "BONK", token_sold_mint_address: "bonk", token_sold_amount: 10, token_bought_symbol: "WIF", token_bought_mint_address: "wif", token_bought_amount: 2, amount_usd: 50 },
    ]);
    expect(trades.map((trade) => trade.side).sort()).toEqual(["buy", "sell"]);
  });

  it("prefers realtime values when merging the same swap leg", () => {
    const historical = normalizeDuneRows([{ block_time: "2026-08-01T10:00:00Z", tx_id: "same", token_sold_symbol: "USDC", token_sold_amount: 10, token_bought_symbol: "BONK", token_bought_mint_address: "bonk", token_bought_amount: 100, amount_usd: 10 }]);
    const realtime = [{ ...historical[0], id: "helius", grossUsd: 11 }];
    expect(mergeTrades(realtime, historical)[0].grossUsd).toBe(11);
  });
});
