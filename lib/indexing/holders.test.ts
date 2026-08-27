import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeTokenAccount } from "./holders";

describe("holder account decoding", () => {
  it("decodes the canonical SPL owner and raw amount", () => {
    const owner = Keypair.generate().publicKey;
    const data = Buffer.alloc(72);
    owner.toBuffer().copy(data, 32);
    data.writeBigUInt64LE(42n, 64);
    expect(decodeTokenAccount(data)).toEqual({ owner: owner.toBase58(), amount: 42n });
  });

  it("rejects truncated and zero-balance accounts", () => {
    expect(decodeTokenAccount(Buffer.alloc(10))).toBeNull();
    expect(decodeTokenAccount(Buffer.alloc(72))).toBeNull();
  });
});
