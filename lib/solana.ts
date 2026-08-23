import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMPSWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const BURN_ADDRESSES = new Set(["1nc1nerator11111111111111111111111111111111"]);

export function rpcUrl() {
  return process.env.HELIUS_RPC_URL || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "https://api.mainnet-beta.solana.com");
}

export function connection() { return new Connection(rpcUrl(), "confirmed"); }

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Public Solana RPC endpoints often reply 429 under bursty scans. Retry only that transient case. */
export async function rpcRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/\b429\b|too many requests|rate limit/i.test(message) || attempt === attempts - 1) throw error;
      await pause(550 * 2 ** attempt + Math.round(Math.random() * 180));
    }
  }
  throw lastError;
}

export function hasDedicatedRpc() { return Boolean(process.env.HELIUS_API_KEY || process.env.HELIUS_RPC_URL?.includes("api-key=")); }

export function deriveBondingCurve(mint: PublicKey, tokenProgram = TOKEN_PROGRAM_ID) {
  const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM);
  const associatedBondingCurve = getAssociatedTokenAddressSync(mint, bondingCurve, true, tokenProgram);
  return { bondingCurve, associatedBondingCurve };
}

export function tokenProgramFor(owner: PublicKey) {
  return owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export function parseCurveAccount(data: Buffer) {
  if (data.length < 49) return null;
  const read = (offset: number) => data.readBigUInt64LE(offset);
  const base = 8;
  return {
    virtualTokenReserves: read(base), virtualSolReserves: read(base + 8), realTokenReserves: read(base + 16),
    realSolReserves: read(base + 24), tokenTotalSupply: read(base + 32), complete: data[base + 40] === 1,
    creator: data.length >= base + 73 ? new PublicKey(data.subarray(base + 41, base + 73)).toBase58() : null,
  };
}

export function pct(value: bigint, total: bigint) { return total === 0n ? 0 : Number((value * 10000n) / total) / 100; }
export function uiAmount(value: bigint, decimals: number) { return Number(value) / 10 ** decimals; }

export function parseMintInput(input: string) {
  const value = input.trim();
  const pumpUrl = value.match(/^https?:\/\/(?:www\.)?pump\.fun\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})\/?$/i);
  const candidate = pumpUrl?.[1] || value;
  try { return new PublicKey(candidate); } catch { return null; }
}
