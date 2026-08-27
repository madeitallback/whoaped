import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeSwap } from "./providers";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";
const TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6nLQNbRBJqCE8Jrp";

describe("Helius swap normalization", () => {
  const originalBirdeyeKey = process.env.BIRDEYE_API_KEY;

  beforeEach(() => { process.env.BIRDEYE_API_KEY = "test-key"; });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBirdeyeKey === undefined) delete process.env.BIRDEYE_API_KEY;
    else process.env.BIRDEYE_API_KEY = originalBirdeyeKey;
  });

  it("keeps SOL received for a stablecoin as a SOL buy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { value: 150 } }), { status: 200 }))));
    const trades = await normalizeSwap({
      signature: "stable-to-sol",
      timestamp: 1_700_000_001,
      events: { swap: {
        tokenInputs: [{ mint: USDC, rawTokenAmount: { tokenAmount: "500000000", decimals: 6 } }],
        tokenOutputs: [],
        nativeOutput: { amount: "2500000000" },
      } },
    }, 0);

    expect(trades).toEqual([expect.objectContaining({ token: SOL, symbol: "SOL", side: "buy", quantity: 2.5, grossUsd: 375 })]);
  });

  it("keeps SOL sent for a stablecoin as a SOL sale", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { value: 150 } }), { status: 200 }))));
    const trades = await normalizeSwap({
      signature: "sol-to-stable",
      timestamp: 1_700_000_002,
      events: { swap: {
        nativeInput: { amount: "1250000000" },
        tokenInputs: [],
        tokenOutputs: [{ mint: USDC, rawTokenAmount: { tokenAmount: "187500000", decimals: 6 } }],
      } },
    }, 0);

    expect(trades).toEqual([expect.objectContaining({ token: SOL, symbol: "SOL", side: "sell", quantity: 1.25, grossUsd: 187.5 })]);
  });

  it("uses the non-stable token leg for SOL-to-token swaps without double-counting SOL", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { value: 2 } }), { status: 200 }))));
    const trades = await normalizeSwap({
      signature: "sol-to-token",
      timestamp: 1_700_000_003,
      events: { swap: {
        nativeInput: { amount: 1_000_000_000 },
        tokenInputs: [],
        tokenOutputs: [{ mint: TOKEN, rawTokenAmount: { tokenAmount: "400000000", decimals: 6 } }],
      } },
    }, 0);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ token: TOKEN, side: "buy", quantity: 400 });
  });
});
