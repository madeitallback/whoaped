import { PublicKey } from "@solana/web3.js";
import { findRecentCurveBuyers } from "./buyers";
import { BURN_ADDRESSES, connection, deriveBondingCurve, parseCurveAccount, pct, rpcRetry, tokenProgramFor, uiAmount } from "./solana";
import type { TokenHolder, TokenScan } from "./types";

type Metadata = { name: string; symbol: string; image: string | null; priceUsd: number | null; liquidityUsd: number | null };
type OwnerBalance = { owner: string; tokenAccount: string; amount: bigint };

async function metadata(mint: string): Promise<Metadata | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    const body = await response.json() as { pairs?: Array<{ chainId: string; baseToken: { address: string; name: string; symbol: string }; quoteToken: { address: string; name: string; symbol: string }; info?: { imageUrl?: string }; priceUsd?: string; liquidity?: { usd?: number } }> };
    const pair = (body.pairs || []).find((item) => item.chainId === "solana" && (item.baseToken.address === mint || item.quoteToken.address === mint));
    if (!pair) return null;
    const token = pair.baseToken.address === mint ? pair.baseToken : pair.quoteToken;
    return { name: token.name, symbol: token.symbol, image: pair.info?.imageUrl || null, priceUsd: pair.priceUsd ? Number(pair.priceUsd) || null : null, liquidityUsd: pair.liquidity?.usd || null };
  } catch { return null; }
}

async function topOwners(mint: PublicKey) {
  const rpc = connection();
  const largest = await rpcRetry(() => rpc.getTokenLargestAccounts(mint));
  const accounts = await rpcRetry(() => rpc.getMultipleParsedAccounts(largest.value.map((item) => item.address)));
  const owners = new Map<string, OwnerBalance>();
  accounts.value.forEach((account, index) => {
    if (!account || typeof account.data !== "object" || !("parsed" in account.data)) return;
    const info = account.data.parsed.info as { owner?: string; tokenAmount?: { amount?: string } };
    if (!info.owner || !info.tokenAmount?.amount) return;
    const previous = owners.get(info.owner);
    owners.set(info.owner, { owner: info.owner, tokenAccount: largest.value[index].address.toBase58(), amount: (previous?.amount || 0n) + BigInt(info.tokenAmount.amount) });
  });
  return [...owners.values()].sort((left, right) => left.amount === right.amount ? 0 : left.amount > right.amount ? -1 : 1);
}

export async function scanToken(mint: PublicKey): Promise<TokenScan> {
  const rpc = connection();
  const mintAddress = mint.toBase58();
  const [supply, mintInfo, tokenMetadata, owners] = await Promise.all([
    rpcRetry(() => rpc.getTokenSupply(mint)),
    rpcRetry(() => rpc.getAccountInfo(mint)),
    metadata(mintAddress),
    topOwners(mint),
  ]);
  if (!mintInfo) throw new Error("Mint account was not found on Solana mainnet.");
  const total = BigInt(supply.value.amount);
  const decimals = supply.value.decimals;
  const { bondingCurve, associatedBondingCurve } = deriveBondingCurve(mint, tokenProgramFor(mintInfo.owner));
  const curveAccount = await rpcRetry(() => rpc.getAccountInfo(bondingCurve));
  const curve = curveAccount?.owner.equals(new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")) ? parseCurveAccount(curveAccount.data) : null;
  const isPumpFun = Boolean(curve);
  const curveBalance = isPumpFun ? await rpcRetry(() => rpc.getTokenAccountBalance(associatedBondingCurve)).then((value) => BigInt(value.value.amount)).catch(() => 0n) : 0n;
  const graduated = curve ? curve.complete || curveBalance === 0n : null;
  const initialReserves = 793_100_000n * 10n ** BigInt(decimals);
  const curveProgressPct = curve ? Math.max(0, Math.min(100, 100 - Number(curve.realTokenReserves * 10000n / initialReserves) / 100)) : null;
  const holders: TokenHolder[] = owners.map((item) => ({
    owner: item.owner,
    tokenAccount: item.tokenAccount,
    uiAmount: uiAmount(item.amount, decimals),
    pctOfSupply: pct(item.amount, total),
    label: item.owner === bondingCurve.toBase58() ? "curve" : item.owner === curve?.creator ? "creator" : BURN_ADDRESSES.has(item.owner) ? "burn" : "unknown",
    fomoHandle: null,
  }));
  const balances = new Map(owners.map((item) => [item.owner, item.amount]));
  const warnings: string[] = [];
  let buyerResult = { buyers: [] as Array<{ owner: string; buyTxCount: number; firstBuyAt: string | null }>, scannedSignatures: 0, truncated: false, warning: null as string | null };
  if (isPumpFun) {
    try { buyerResult = await findRecentCurveBuyers(rpc, bondingCurve, mint, 100); }
    catch (error) { warnings.push(error instanceof Error ? error.message : "Recent Pump buyer scan failed."); }
  } else warnings.push("This mint is not recognized as a Pump.fun bonding-curve token.");
  if (buyerResult.warning) warnings.push(buyerResult.warning);
  if (buyerResult.truncated) warnings.push("Buyer coverage is partial: the fast scan verifies only the latest 100 curve signatures.");
  const buyers = buyerResult.buyers.map((buyer) => {
    const held = balances.get(buyer.owner) || 0n;
    return { owner: buyer.owner, buyTxCount: buyer.buyTxCount, firstBuyAt: buyer.firstBuyAt, stillHolds: held > 0n, uiAmount: uiAmount(held, decimals), pctOfSupply: pct(held, total), fomoHandle: null, phase: "pre_grad" as const };
  }).sort((left, right) => right.uiAmount - left.uiAmount || right.buyTxCount - left.buyTxCount);
  return {
    ok: true,
    mint: mintAddress,
    token: { name: tokenMetadata?.name || "Solana token", symbol: tokenMetadata?.symbol || mintAddress.slice(0, 5).toUpperCase(), image: tokenMetadata?.image || null, decimals, supplyUi: uiAmount(total, decimals), isPumpFun, graduated, curveProgressPct, priceUsd: tokenMetadata?.priceUsd || null, liquidityUsd: tokenMetadata?.liquidityUsd || null },
    addresses: { bondingCurve: isPumpFun ? bondingCurve.toBase58() : null, creator: curve?.creator || null },
    summary: { visibleHolders: holders.length, visibleBuyers: buyers.length, stillHoldingBuyers: buyers.filter((buyer) => buyer.stillHolds).length, verifiedFomoWallets: 0, verifiedFomoSupplyPct: null },
    coverage: { holderState: "partial", buyerState: buyerResult.truncated ? "partial" : "complete", labelState: "not_started", scannedSignatures: buyerResult.scannedSignatures, signatureLimit: 100, holdersShown: holders.length, labelsChecked: 0, note: `Fast view of ${holders.length} largest token accounts. Full holder, post-graduation, and identity indexing will continue asynchronously.` },
    holders,
    buyers,
    updatedAt: new Date().toISOString(),
    warnings,
  };
}
