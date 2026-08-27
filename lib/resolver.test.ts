import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAnalyzeInput } from "./resolver";

describe("resolveAnalyzeInput", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("extracts a public Pump wallet from a profile link", async () => {
    const result = await resolveAnalyzeInput({
      source: "manual",
      solanaAddress: "https://pump.fun/profile/2ksQ77e9e5SS6VA6poanRGWfkU3R4R5wZnptbJHb2nx9?tab=followers",
    });
    expect(result.source).toBe("pump");
    expect(result.solanaAddress).toBe("2ksQ77e9e5SS6VA6poanRGWfkU3R4R5wZnptbJHb2nx9");
  });

  it("resolves a bare Fomo handle through its public verified wallet index", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: {
        username: "frankdegods",
        displayName: "frank",
        wallets: {
          solana: { address: "2ksQ77e9e5SS6VA6poanRGWfkU3R4R5wZnptbJHb2nx9", status: "verified" },
          evm: { address: "0x1234", status: "verified" },
        },
      },
    }), { status: 200 })));
    const result = await resolveAnalyzeInput({ source: "manual", solanaAddress: "@frankdegods" });
    expect(result.source).toBe("fomo");
    expect(result.handle).toBe("frankdegods");
    expect(result.label).toBe("frank");
    expect(result.evmAddress).toBe("0x1234");
  });

  it("does not treat an unverified Fomo record as an analyzable wallet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: { wallets: { solana: { address: null, status: "missing" } } },
    }), { status: 200 })));
    await expect(resolveAnalyzeInput({ source: "fomo", solanaAddress: "@notyetverified" }))
      .rejects.toThrow("no verified Solana wallet");
  });
});
