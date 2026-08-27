import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { pumpBuyOwner } from "./buyers";
import { parseFomoScanProfile } from "./fomoscan";
import { deriveBondingCurve, parseMintInput, PUMP_PROGRAM } from "./solana";

describe("token input", () => {
  it("accepts a mint or Pump URL and rejects arbitrary text", () => {
    const mint = "So11111111111111111111111111111111111111112";
    expect(parseMintInput(mint)?.toBase58()).toBe(mint);
    expect(parseMintInput(`https://pump.fun/coin/${mint}`)?.toBase58()).toBe(mint);
    expect(parseMintInput("not a mint")).toBeNull();
  });

  it("derives a deterministic off-curve bonding PDA", () => {
    const mint = new PublicKey("So11111111111111111111111111111111111111112");
    const first = deriveBondingCurve(mint);
    expect(first.bondingCurve.equals(deriveBondingCurve(mint).bondingCurve)).toBe(true);
    expect(PublicKey.isOnCurve(first.bondingCurve.toBytes())).toBe(false);
  });
});

describe("verified Pump buys", () => {
  it("recognizes legacy and v2 layouts only when mint and curve match", () => {
    const mint = "Mint111111111111111111111111111111111111111";
    const curve = "Curve11111111111111111111111111111111111111";
    const legacy = Array.from({ length: 7 }, (_, index) => `legacy-${index}`);
    legacy[2] = mint; legacy[3] = curve; legacy[6] = "legacy-user";
    expect(pumpBuyOwner({ programId: PUMP_PROGRAM.toBase58(), accounts: legacy, data: bs58.encode(Buffer.from("66063d1201daebea", "hex")) }, mint, curve)).toBe("legacy-user");
    legacy[3] = "wrong";
    expect(pumpBuyOwner({ programId: PUMP_PROGRAM.toBase58(), accounts: legacy, data: bs58.encode(Buffer.from("66063d1201daebea", "hex")) }, mint, curve)).toBeNull();
  });
});

describe("FomoScan v2", () => {
  it("keeps the stable id and handle", () => {
    expect(parseFomoScanProfile({ id: "profile-1", handle: "trader" })).toEqual({ identityId: "profile-1", handle: "trader", source: "fomoscan" });
  });
});
