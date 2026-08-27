import { describe, expect, it } from "vitest";
import { calculateWalletMetrics, closeLotsFIFO } from "./analysis";
import type { NormalizedTrade } from "./types";

const buy = (id: string, quantity: number, grossUsd: number, timestamp: number): NormalizedTrade => ({ id, signature: id, token: "MINT", symbol: "TEST", side: "buy", quantity, grossUsd, priceUsd: grossUsd / quantity, timestamp });
const sell = (id: string, quantity: number, grossUsd: number, timestamp: number): NormalizedTrade => ({ id, signature: id, token: "MINT", symbol: "TEST", side: "sell", quantity, grossUsd, priceUsd: grossUsd / quantity, timestamp });

describe("FIFO lot accounting", () => {
  it("matches a partial sale against the earliest purchase", () => {
    const closed = closeLotsFIFO([buy("b1", 10, 100, 100), buy("b2", 10, 300, 200), sell("s1", 15, 450, 300)]);
    expect(closed).toHaveLength(2);
    expect(closed[0].costUsd).toBe(100);
    expect(closed[1].costUsd).toBe(150);
    expect(closed[0].pnlUsd + closed[1].pnlUsd).toBe(200);
  });

  it("reports no PnL when no lots close", () => {
    const metrics = calculateWalletMetrics([buy("b1", 10, 100, 100)]);
    expect(metrics.score).toBeNull();
    expect(metrics.realizedPnlUsd).toBeNull();
  });
});
