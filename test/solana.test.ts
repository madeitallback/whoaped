import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { deriveBondingCurve, PUMP_PROGRAM } from "../lib/solana";
import { pumpBuyOwner } from "../lib/buyers";
import { pumpSwapBuyOwner } from "../lib/pumpswap-index";
import { parseFomoScanProfile } from "../lib/fomo";

describe("deriveBondingCurve", () => {
  it("is deterministic and returns an off-curve PDA", () => {
    const mint = new PublicKey("So11111111111111111111111111111111111111112");
    const first = deriveBondingCurve(mint);
    const second = deriveBondingCurve(mint);
    expect(first.bondingCurve.toBase58()).toBe(second.bondingCurve.toBase58());
    expect(PublicKey.isOnCurve(first.bondingCurve.toBytes())).toBe(false);
    expect(first.associatedBondingCurve.equals(first.bondingCurve)).toBe(false);
  });
});

describe("Pump buy layouts", () => {
  const mint = "Mint111111111111111111111111111111111111111";
  const curve = "Curve11111111111111111111111111111111111111";
  const user = "User111111111111111111111111111111111111111";
  const data = (discriminator: string) => bs58.encode(Buffer.from(discriminator, "hex"));

  it("recognises a legacy buy only with its matching mint and curve", () => {
    const accounts = Array.from({ length: 7 }, (_, index) => `legacy-${index}`);
    accounts[2] = mint; accounts[3] = curve; accounts[6] = user;
    expect(pumpBuyOwner({ programId: PUMP_PROGRAM.toBase58(), accounts, data: data("66063d1201daebea") }, mint, curve)).toBe(user);
    accounts[3] = "wrong-curve";
    expect(pumpBuyOwner({ programId: PUMP_PROGRAM.toBase58(), accounts, data: data("66063d1201daebea") }, mint, curve)).toBeNull();
  });

  it("recognises the v2 account layout", () => {
    const accounts = Array.from({ length: 14 }, (_, index) => `v2-${index}`);
    accounts[1] = mint; accounts[10] = curve; accounts[13] = user;
    expect(pumpBuyOwner({ programId: PUMP_PROGRAM.toBase58(), accounts, data: data("b817ee6167c5d33d") }, mint, curve)).toBe(user);
  });
});

describe("FomoScan v2 profile parsing", () => {
  it("keeps the stable identity id and handle from the v2 response", () => {
    expect(parseFomoScanProfile({ id: "profile-123", handle: "trader", solanaAddress: "wallet" })).toEqual({ identityId: "profile-123", handle: "trader", confidence: null, source: "fomoscan" });
  });
});

describe("PumpSwap buy layout", () => {
  it("recognises official buy account positions and rejects another base mint", () => {
    const mint = "Mint111111111111111111111111111111111111111";
    const accounts = Array.from({ length: 4 }, (_, index) => `swap-${index}`);
    accounts[1] = "buyer"; accounts[3] = mint;
    expect(pumpSwapBuyOwner({ programId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", accounts, data: bs58.encode(Buffer.from("66063d1201daebea", "hex")) }, mint)).toBe("buyer");
    expect(pumpSwapBuyOwner({ programId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", accounts, data: bs58.encode(Buffer.from("66063d1201daebea", "hex")) }, "wrong-mint")).toBeNull();
  });
});
