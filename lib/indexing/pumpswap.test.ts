import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { PUMPSWAP_PROGRAM } from "../token-intel/solana";
import { pumpSwapBuyOwner, pumpSwapTradeEvent } from "./pumpswap";

describe("verified PumpSwap buys", () => {
  it("requires the official buy discriminator, mint position, and user position", () => {
    const accounts = ["pool", "buyer", "quote", "mint"];
    const instruction = { programId: PUMPSWAP_PROGRAM, accounts, data: bs58.encode(Buffer.from("66063d1201daebea", "hex")) };
    expect(pumpSwapBuyOwner(instruction, "mint")).toBe("buyer");
    expect(pumpSwapBuyOwner({ ...instruction, accounts: ["pool", "buyer", "quote", "wrong"] }, "mint")).toBeNull();
    expect(pumpSwapBuyOwner({ ...instruction, data: bs58.encode(Buffer.from("0000000000000000", "hex")) }, "mint")).toBeNull();
  });

  it("decodes an official sell and its exact base quantity", () => {
    const accounts = ["pool", "seller", "config", "mint"];
    const data = Buffer.alloc(16);
    Buffer.from("33e685a4017f83ad", "hex").copy(data);
    data.writeBigUInt64LE(42n, 8);
    expect(pumpSwapTradeEvent({ programId: PUMPSWAP_PROGRAM, accounts, data: bs58.encode(data) }, "mint")).toMatchObject({ owner: "seller", side: "sell", quantityRaw: "42" });
    expect(pumpSwapBuyOwner({ programId: PUMPSWAP_PROGRAM, accounts, data: bs58.encode(data) }, "mint")).toBeNull();
  });
});
