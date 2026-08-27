import bs58 from "bs58";
import type { Connection, PublicKey } from "@solana/web3.js";
import type { VerifiedBuyEvent } from "../token-intel/buyers";
import { PUMPSWAP_PROGRAM, rpcRetry } from "../token-intel/solana";

type Instruction = { programId?: string; accounts?: string[]; data?: string };
type EnhancedTransaction = { signature?: string; timestamp?: number; instructions?: Instruction[] };
const BUY_DISCRIMINATORS = new Set(["66063d1201daebea", "c62e1552b4d9e870"]);

export function pumpSwapBuyOwner(instruction: Instruction, mint: string) {
  if (instruction.programId !== PUMPSWAP_PROGRAM || !instruction.data || !instruction.accounts) return null;
  try {
    const discriminator = Buffer.from(bs58.decode(instruction.data)).subarray(0, 8).toString("hex");
    return BUY_DISCRIMINATORS.has(discriminator) && instruction.accounts[3] === mint ? instruction.accounts[1] || null : null;
  } catch { return null; }
}

export async function findPumpSwapBuyerPage(connection: Connection, mint: PublicKey, before?: string | null, limit = 100) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("Helius Enhanced Transactions requires HELIUS_API_KEY.");
  const signatures = await rpcRetry(() => connection.getSignaturesForAddress(mint, { limit, ...(before ? { before } : {}) }));
  const response = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "whoaped-indexer/1.0" },
    body: JSON.stringify({ transactions: signatures.map((item) => item.signature) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Helius enhanced transactions failed (${response.status}).`);
  const transactions = await response.json() as EnhancedTransaction[];
  const times = new Map(signatures.map((item) => [item.signature, item.blockTime || null]));
  const events = new Map<string, VerifiedBuyEvent>();
  for (const transaction of transactions) for (const instruction of transaction.instructions || []) {
    const owner = pumpSwapBuyOwner(instruction, mint.toBase58());
    const signature = transaction.signature || "";
    if (!owner || !signature) continue;
    const seconds = transaction.timestamp || times.get(signature) || null;
    const at = seconds ? new Date(seconds * 1000).toISOString() : null;
    events.set(`${signature}:${owner}`, { signature, owner, at, venue: "pumpswap", phase: "post_grad" });
  }
  return { events: [...events.values()], scannedSignatures: signatures.length, nextCursor: signatures.length >= limit ? signatures.at(-1)?.signature || null : null };
}
