import { PublicKey } from "@solana/web3.js";
import { connection, rpcRetry, rpcUrl, uiAmount } from "../token-intel/solana";

export type IndexedHolder = { wallet: string; tokenAccount: string; balanceUi: number; pctOfSupply: number; label: "unknown" };
type ProgramAccountPage = { accounts: Array<{ pubkey: string; account: { data: [string, "base64"] } }>; paginationKey: string | null };

export function decodeTokenAccount(data: Buffer) {
  if (data.length < 72) return null;
  const amount = data.readBigUInt64LE(64);
  if (amount === 0n) return null;
  return { owner: new PublicKey(data.subarray(32, 64)).toBase58(), amount };
}

async function loadPage(program: string, mint: string, paginationKey: string | null): Promise<ProgramAccountPage> {
  const response = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `whoaped-holders-${paginationKey || "first"}`,
      method: "getProgramAccountsV2",
      params: [program, {
        commitment: "confirmed",
        encoding: "base64",
        dataSlice: { offset: 0, length: 72 },
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
        limit: 1_000,
        ...(paginationKey ? { paginationKey } : {}),
      }],
    }),
    cache: "no-store",
  });
  const body = await response.json() as { error?: { message?: string }; result?: ProgramAccountPage };
  if (!response.ok || body.error || !body.result) throw new Error(body.error?.message || `Holder RPC returned ${response.status}.`);
  return body.result;
}

export async function indexAllHolders(mintAddress: string) {
  if (!process.env.HELIUS_API_KEY && !process.env.HELIUS_RPC_URL?.includes("api-key=")) {
    throw new Error("Complete holder indexing requires a dedicated Helius RPC endpoint.");
  }
  const mint = new PublicKey(mintAddress);
  const rpc = connection();
  const [mintInfo, supply] = await Promise.all([
    rpcRetry(() => rpc.getAccountInfo(mint)),
    rpcRetry(() => rpc.getTokenSupply(mint)),
  ]);
  if (!mintInfo) throw new Error("Mint account was not found while indexing holders.");
  const totalRaw = BigInt(supply.value.amount);
  const byOwner = new Map<string, { tokenAccount: string; amount: bigint }>();
  const seenCursors = new Set<string>();
  let paginationKey: string | null = null;
  let tokenAccountCount = 0;
  do {
    const page = await rpcRetry(() => loadPage(mintInfo.owner.toBase58(), mintAddress, paginationKey));
    tokenAccountCount += page.accounts.length;
    for (const account of page.accounts) {
      const decoded = decodeTokenAccount(Buffer.from(account.account.data[0], "base64"));
      if (!decoded) continue;
      const previous = byOwner.get(decoded.owner);
      byOwner.set(decoded.owner, { tokenAccount: previous?.tokenAccount || account.pubkey, amount: (previous?.amount || 0n) + decoded.amount });
    }
    paginationKey = page.paginationKey;
    if (paginationKey && seenCursors.has(paginationKey)) throw new Error("Holder RPC returned a repeated pagination cursor.");
    if (paginationKey) seenCursors.add(paginationKey);
  } while (paginationKey);

  const holders: IndexedHolder[] = [...byOwner.entries()].map(([wallet, value]) => ({
    wallet,
    tokenAccount: value.tokenAccount,
    balanceUi: uiAmount(value.amount, supply.value.decimals),
    pctOfSupply: totalRaw === 0n ? 0 : Number(value.amount * 10000n / totalRaw) / 100,
    label: "unknown" as const,
  })).sort((left, right) => right.balanceUi - left.balanceUi);
  return { holders, tokenAccountCount, observedAt: new Date().toISOString() };
}
