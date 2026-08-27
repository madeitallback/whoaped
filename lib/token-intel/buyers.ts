import bs58 from "bs58";
import type { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_PROGRAM, rpcRetry } from "./solana";

const LEGACY_BUYS = new Set(["66063d1201daebea", "f8c69e91e17587c8", "38fc74089edfcd5f"]);
const V2_BUYS = new Set(["c2ab1c46684d5b2f", "b817ee6167c5d33d"]);
type Instruction = { programId?: string; accounts?: string[]; data?: string };
type EnhancedTransaction = { signature?: string; timestamp?: number; instructions?: Instruction[] };
export type CurveBuyer = { owner: string; buyTxCount: number; firstBuyAt: string | null };
export type VerifiedBuyEvent = { signature: string; owner: string; at: string | null; venue: "curve" | "pumpswap"; phase: "pre_grad" | "post_grad" };

export function pumpBuyOwner(instruction: Instruction, mint: string, curve: string) {
  if (instruction.programId !== PUMP_PROGRAM.toBase58() || !instruction.data || !instruction.accounts) return null;
  try {
    const discriminator = Buffer.from(bs58.decode(instruction.data)).subarray(0, 8).toString("hex");
    if (LEGACY_BUYS.has(discriminator) && instruction.accounts[2] === mint && instruction.accounts[3] === curve) return instruction.accounts[6] || null;
    if (V2_BUYS.has(discriminator) && instruction.accounts[1] === mint && instruction.accounts[10] === curve) return instruction.accounts[13] || null;
  } catch { return null; }
  return null;
}

async function parseCurveTransactions(signatures: Awaited<ReturnType<Connection["getSignaturesForAddress"]>>, curve: PublicKey, mint: PublicKey) {
  if (!process.env.HELIUS_API_KEY) throw new Error("HELIUS_API_KEY is required to verify Pump buy instructions.");
  const response = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "whoaped-token-intel/1.0" },
    body: JSON.stringify({ transactions: signatures.map((item) => item.signature) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Helius enhanced transactions failed (${response.status}).`);
  const transactions = await response.json() as EnhancedTransaction[];
  const buyers = new Map<string, CurveBuyer>();
  const events = new Map<string, VerifiedBuyEvent>();
  const signatureTimes = new Map(signatures.map((item) => [item.signature, item.blockTime || null]));
  for (const transaction of transactions) {
    for (const instruction of transaction.instructions || []) {
      const owner = pumpBuyOwner(instruction, mint.toBase58(), curve.toBase58());
      if (!owner) continue;
      const previous = buyers.get(owner);
      const seconds = transaction.timestamp || signatureTimes.get(transaction.signature || "") || null;
      const at = seconds ? new Date(seconds * 1000).toISOString() : null;
      if (transaction.signature) events.set(`${transaction.signature}:${owner}`, { signature: transaction.signature, owner, at, venue: "curve", phase: "pre_grad" });
      buyers.set(owner, { owner, buyTxCount: (previous?.buyTxCount || 0) + 1, firstBuyAt: previous?.firstBuyAt && at ? (previous.firstBuyAt < at ? previous.firstBuyAt : at) : previous?.firstBuyAt || at });
    }
  }
  return { buyers: [...buyers.values()], events: [...events.values()] };
}

export async function findRecentCurveBuyers(connection: Connection, curve: PublicKey, mint: PublicKey, limit = 100) {
  const signatures = await rpcRetry(() => connection.getSignaturesForAddress(curve, { limit }));
  if (!process.env.HELIUS_API_KEY) return { buyers: [] as CurveBuyer[], scannedSignatures: signatures.length, truncated: signatures.length >= limit, warning: "HELIUS_API_KEY is required to verify Pump buy instructions." };
  const parsed = await parseCurveTransactions(signatures, curve, mint);
  return { buyers: parsed.buyers, scannedSignatures: signatures.length, truncated: signatures.length >= limit, warning: null };
}

export async function findCurveBuyerPage(connection: Connection, curve: PublicKey, mint: PublicKey, before?: string | null, limit = 100) {
  const signatures = await rpcRetry(() => connection.getSignaturesForAddress(curve, { limit, ...(before ? { before } : {}) }));
  const parsed = await parseCurveTransactions(signatures, curve, mint);
  return { ...parsed, scannedSignatures: signatures.length, nextCursor: signatures.length >= limit ? signatures.at(-1)?.signature || null : null };
}
