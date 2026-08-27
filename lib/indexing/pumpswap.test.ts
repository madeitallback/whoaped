import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { PUMPSWAP_PROGRAM } from "../token-intel/solana";
import { pumpSwapBuyOwner } from "./pumpswap";

describe("verified PumpSwap buys", () => {
  it("requires the official buy discriminator, mint position, and user position", () => {
    const accounts = ["pool", "buyer", "quote", "mint"];
    const instruction = { programId: PUMPSWAP_PROGRAM, accounts, data: bs58.encode(Buffer.from("66063d1201daebea", "hex")) };
    expect(pumpSwapBuyOwner(instruction, "mint")).toBe("buyer");
    expect(pumpSwapBuyOwner({ ...instruction, accounts: ["pool", "buyer", "quote", "wrong"] }, "mint")).toBeNull();
    expect(pumpSwapBuyOwner({ ...instruction, data: bs58.encode(Buffer.from("0000000000000000", "hex")) }, "mint")).toBeNull();
  });
});
