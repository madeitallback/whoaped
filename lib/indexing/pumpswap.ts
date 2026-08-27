import bs58 from "bs58";
import type { Connection, PublicKey } from "@solana/web3.js";
import type { VerifiedTradeEvent } from "../token-intel/buyers";
import { PUMPSWAP_PROGRAM, rpcRetry } from "../token-intel/solana";

type Instruction = { programId?: string; accounts?: string[]; data?: string; innerInstructions?: Instruction[] };
type EnhancedTransaction = { signature?: string; timestamp?: number; instructions?: Instruction[] };
const BUY_DISCRIMINATORS = new Set(["66063d1201daebea", "c62e1552b4d9e870"]);
const SELL_DISCRIMINATOR = "33e685a4017f83ad";

function walkInstructions(instructions: Instruction[]): Instruction[] {
  return instructions.flatMap((instruction) => [instruction, ...walkInstructions(instruction.innerInstructions || [])]);
}

export function pumpSwapTradeEvent(instruction: Instruction, mint: string) {
  if (instruction.programId !== PUMPSWAP_PROGRAM || !instruction.data || !instruction.accounts) return null;
  try {
    const decoded = Buffer.from(bs58.decode(instruction.data));
    const discriminator = decoded.subarray(0, 8).toString("hex");
    if (![...BUY_DISCRIMINATORS, SELL_DISCRIMINATOR].includes(discriminator) || instruction.accounts[3] !== mint) return null;
    return {
      owner: instruction.accounts[1] || null,
      side: discriminator === SELL_DISCRIMINATOR ? "sell" as const : "buy" as const,
      quantityRaw: discriminator === "c62e1552b4d9e870" ? null : decoded.length >= 16 ? decoded.readBigUInt64LE(8).toString() : null,
      decoderVariant: discriminator,
    };
  } catch { return null; }
}

export function pumpSwapBuyOwner(instruction: Instruction, mint: string) {
  const event = pumpSwapTradeEvent(instruction, mint);
  return event?.side === "buy" ? event.owner : null;
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
  const events = new Map<string, VerifiedTradeEvent>();
  for (const transaction of transactions) for (const instruction of walkInstructions(transaction.instructions || [])) {
    const decoded = pumpSwapTradeEvent(instruction, mint.toBase58());
    const owner = decoded?.owner;
    const signature = transaction.signature || "";
    if (!owner || !signature || !decoded) continue;
    const seconds = transaction.timestamp || times.get(signature) || null;
    const at = seconds ? new Date(seconds * 1000).toISOString() : null;
    events.set(`${signature}:${owner}:${decoded.side}`, { signature, owner, at, venue: "pumpswap", phase: "post_grad", side: decoded.side, quantityRaw: decoded.quantityRaw, decoderVariant: decoded.decoderVariant });
  }
  return { events: [...events.values()], scannedSignatures: signatures.length, nextCursor: signatures.length >= limit ? signatures.at(-1)?.signature || null : null };
}
