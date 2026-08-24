import bs58 from "bs58";
import type { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_PROGRAM, hasDedicatedRpc, rpcRetry } from "./solana";

// Pump has two account layouts in the wild.  The legacy layout puts
// mint/curve/user at 2/3/6; the current v2 layout puts them at 1/10/13.
// Keep these in one place so a signature is never treated as a buyer solely
// because it touched the bonding curve.
const LEGACY_BUY_DISCRIMINATORS = new Set([
  "66063d1201daebea", // buy
  "f8c69e91e17587c8", // legacy buy exact-in variant
  "38fc74089edfcd5f", // buy_exact_sol_in
]);
const V2_BUY_DISCRIMINATORS = new Set([
  "c2ab1c46684d5b2f", // buy_exact_quote_in_v2
  "b817ee6167c5d33d", // buy_v2
]);
export type CurveBuyer = { owner: string; buyTxCount: number; firstBuyAt: string | null };
export type CurveBuyEvent = { signature: string; owner: string; at: string | null };

function hex(data: string) { return Buffer.from(bs58.decode(data)).subarray(0, 8).toString("hex"); }
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type EnhancedInstruction = { programId?: string; accounts?: string[]; data?: string };
type EnhancedTransaction = { signature?: string; timestamp?: number; instructions?: EnhancedInstruction[] };

/** Returns the verified buyer only when instruction layout and PDA inputs agree. */
export function pumpBuyOwner(instruction: EnhancedInstruction, mint: string, curve: string) {
  if (instruction.programId !== PUMP_PROGRAM.toBase58() || !instruction.data || !instruction.accounts) return false;
  try {
    const discriminator = hex(instruction.data);
    if (LEGACY_BUY_DISCRIMINATORS.has(discriminator)
      && instruction.accounts[2] === mint
      && instruction.accounts[3] === curve
      && instruction.accounts[6]) return instruction.accounts[6];
    if (V2_BUY_DISCRIMINATORS.has(discriminator)
      && instruction.accounts[1] === mint
      && instruction.accounts[10] === curve
      && instruction.accounts[13]) return instruction.accounts[13];
    return null;
  } catch { return null; }
}

/**
 * Helius Enhanced Transactions parses up to 100 signatures per request. This
 * avoids the 25 concurrent JSON-RPC calls that exceed the free Helius quota.
 */
async function parseHeliusSignatures(signatures: Awaited<ReturnType<Connection["getSignaturesForAddress"]>>, curve: PublicKey, mint: PublicKey) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("Helius key is missing");
  const byWallet = new Map<string, CurveBuyer>();
  const events = new Map<string, CurveBuyEvent>();
  const signatureOrder = new Map(signatures.map((item, position) => [item.signature, position]));
  let latestBuy: CurveBuyEvent | null = null;
  let buyTxCount = 0;
  for (let index = 0; index < signatures.length; index += 100) {
    const batch = signatures.slice(index, index + 100);
    const response = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "whoaped-server/0.1" },
      body: JSON.stringify({ transactions: batch.map(item => item.signature) }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Helius enhanced transactions: ${response.status}`);
    const transactions = await response.json() as EnhancedTransaction[];
    const signatureTimes = new Map(batch.map(item => [item.signature, item.blockTime || null]));
    for (const transaction of transactions) {
      for (const instruction of transaction.instructions || []) {
        const owner = pumpBuyOwner(instruction, mint.toBase58(), curve.toBase58());
        if (!owner) continue;
        const seconds = transaction.timestamp || signatureTimes.get(transaction.signature || "") || null;
        const at = seconds ? new Date(seconds * 1000).toISOString() : null;
        const signature = transaction.signature || "";
        if (signature && (!latestBuy || (signatureOrder.get(signature) ?? Number.MAX_SAFE_INTEGER) < (signatureOrder.get(latestBuy.signature) ?? Number.MAX_SAFE_INTEGER))) {
          latestBuy = { signature, owner, at };
        }
        if (signature) events.set(`${signature}:${owner}`, { signature, owner, at });
        const previous = byWallet.get(owner);
        byWallet.set(owner, { owner, buyTxCount: (previous?.buyTxCount || 0) + 1, firstBuyAt: previous?.firstBuyAt || at });
        buyTxCount++;
      }
    }
    // Free Enhanced Transactions has a small request-per-second allowance.
    if (index + 100 < signatures.length) await sleep(650);
  }
  return { buyers: [...byWallet.values()], buyTxCount, latestBuy, events: [...events.values()] };
}

async function findCurveBuyersWithHelius(connection: Connection, curve: PublicKey, mint: PublicKey, cap: number) {
  const signatures = await rpcRetry(() => connection.getSignaturesForAddress(curve, { limit: cap }));
  const result = await parseHeliusSignatures(signatures, curve, mint);
  return { ...result, truncated: signatures.length >= cap };
}

/** One resumable 100-signature page for the Supabase historical indexer. */
export async function findCurveBuyerPage(connection: Connection, curve: PublicKey, mint: PublicKey, before?: string | null, cap = 100) {
  if (!process.env.HELIUS_API_KEY) throw new Error("Helius Enhanced Transactions requires HELIUS_API_KEY.");
  const signatures = await rpcRetry(() => connection.getSignaturesForAddress(curve, { limit: cap, ...(before ? { before } : {}) }));
  const result = await parseHeliusSignatures(signatures, curve, mint);
  return { ...result, nextCursor: signatures.length >= cap ? signatures.at(-1)?.signature || null : null, scannedSignatures: signatures.length };
}

/** Reads a bounded window of curve activity. The Pump buy account list puts `user` at index 6. */
export async function findCurveBuyers(connection: Connection, curve: PublicKey, mint: PublicKey, cap = 350) {
  if (hasDedicatedRpc() && process.env.HELIUS_API_KEY) return findCurveBuyersWithHelius(connection, curve, mint, cap);
  const signatures = await rpcRetry(() => connection.getSignaturesForAddress(curve, { limit: cap }));
  const byWallet = new Map<string, CurveBuyer>();
  const events = new Map<string, CurveBuyEvent>();
  let latestBuy: CurveBuyEvent | null = null;
  let buyTxCount = 0;
  for (let index = 0; index < signatures.length; index += 5) {
    const batch = signatures.slice(index, index + 5);
    const txs = await rpcRetry(() => connection.getParsedTransactions(batch.map(x => x.signature), { maxSupportedTransactionVersion: 0 }));
    txs.forEach((tx, position) => {
      if (!tx?.meta || tx.meta.err) return;
      for (const instruction of tx.transaction.message.instructions) {
        if (!("programId" in instruction) || !instruction.programId.equals(PUMP_PROGRAM) || !("data" in instruction)) continue;
        try {
          const accounts = "accounts" in instruction ? instruction.accounts : [];
          const owner = pumpBuyOwner({
            programId: instruction.programId.toBase58(),
            accounts: accounts.map(account => account.toBase58()),
            data: instruction.data,
          }, mint.toBase58(), curve.toBase58());
          if (!owner) continue;
          const previous = byWallet.get(owner);
          const at = signatures[index + position]?.blockTime ? new Date(signatures[index + position].blockTime! * 1000).toISOString() : null;
          if (!latestBuy) latestBuy = { signature: signatures[index + position].signature, owner, at };
          events.set(`${signatures[index + position].signature}:${owner}`, { signature: signatures[index + position].signature, owner, at });
          byWallet.set(owner, { owner, buyTxCount: (previous?.buyTxCount || 0) + 1, firstBuyAt: previous?.firstBuyAt || at });
          buyTxCount++;
        } catch { /* unknown instruction encoding; skip it */ }
      }
    });
    // Avoid sending the next JSON-RPC batch as a burst to public shared endpoints.
    if (index + 5 < signatures.length) await sleep(450);
  }
  return { buyers: [...byWallet.values()], buyTxCount, latestBuy, events: [...events.values()], truncated: signatures.length >= cap };
}
