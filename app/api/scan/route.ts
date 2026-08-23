import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { cached, store } from "@/lib/cache";
import { resolveFomo } from "@/lib/fomo";
import { findCurveBuyers } from "@/lib/buyers";
import { persistScan } from "@/lib/supabase";
import { loadStoredBuyers } from "@/lib/supabase";
import { advanceDuneJobs, duneIndexState, enqueueDuneBuyerIndex } from "@/lib/dune";
import { advanceHeliusJobs, enqueueHeliusCurveIndex, heliusIndexProgress, heliusIndexState } from "@/lib/helius-index";
import { BURN_ADDRESSES, connection, deriveBondingCurve, hasDedicatedRpc, parseCurveAccount, parseMintInput, pct, PUMPSWAP_PROGRAM, rpcRetry, tokenProgramFor, uiAmount } from "@/lib/solana";
import type { Buyer, BucketMix, Holder, ScanResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 55;

type AccountOwner = { owner: string; tokenAccount: string; amount: bigint };

async function search(query: string) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, { next: { revalidate: 0 } });
  if (!r.ok) return [];
  const body = await r.json() as { pairs?: Array<{ chainId: string; baseToken: { address: string; name: string; symbol: string }; info?: { imageUrl?: string }; fdv?: number }> };
  const seen = new Set<string>();
  return (body.pairs || []).filter(x => x.chainId === "solana" && !seen.has(x.baseToken.address) && !!seen.add(x.baseToken.address)).slice(0, 8).map(x => ({ mint: x.baseToken.address, name: x.baseToken.name, symbol: x.baseToken.symbol, image: x.info?.imageUrl || null, mc: x.fdv || null }));
}

async function tokenMetadata(mint: string) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    const body = await r.json() as { pairs?: Array<{ chainId: string; baseToken: { address: string; name: string; symbol: string }; quoteToken: { address: string; name: string; symbol: string }; info?: { imageUrl?: string } }> };
    const pair = (body.pairs || []).find(x => x.chainId === "solana" && x.baseToken.address === mint) || (body.pairs || []).find(x => x.chainId === "solana" && x.quoteToken.address === mint);
    if (!pair) return null;
    const token = pair.baseToken.address === mint ? pair.baseToken : pair.quoteToken;
    return { name: token.name, symbol: token.symbol, image: pair.info?.imageUrl || null };
  } catch { return null; }
}

function emptyMix(): BucketMix { return { buyers: 0, pctOfBuyers: 0, stillHolding: 0, holdRate: 0, pctOfSupply: 0, buyVolumeSol: null }; }

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { input?: string };
    const input = payload.input?.trim() || "";
    if (!input) return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "Paste a Solana mint, Pump.fun URL, or token search." }, { status: 400 });
    const mint = parseMintInput(input);
    if (!mint) {
      const candidates = await search(input);
      return NextResponse.json({ ok: false, code: candidates.length ? "AMBIGUOUS" : "NOT_FOUND", candidates, error: candidates.length ? "Choose a matching Solana token." : "No Solana tokens found." });
    }
    const key = `scan:${mint.toBase58()}`;
    const duneUpdated = await advanceDuneJobs(mint.toBase58()).catch(() => false);
    const heliusUpdated = await advanceHeliusJobs(mint.toBase58()).catch(() => false);
    const existingDuneState = await duneIndexState(mint.toBase58()).catch(() => "not_started");
    const existingHeliusState = await heliusIndexState(mint.toBase58()).catch(() => "not_started");
    const hit = cached<ScanResponse>(key);
    if (hit && !duneUpdated && !heliusUpdated && existingDuneState !== "failed" && existingHeliusState !== "failed") return NextResponse.json(hit);
    const result = await scan(mint);
    try {
      await persistScan(result);
    } catch {
      // Scanning must remain usable when the optional persistence database is
      // temporarily unavailable or its schema has not been applied yet.
      result.warnings.push("This scan could not be saved yet. Apply the Supabase schema, then scan again.");
    }
    if (await enqueueDuneBuyerIndex(result.mint, result.addresses.creator).catch(() => false)) {
      result.warnings.push("Historical Dune indexing started. Refresh this token shortly for PumpSwap and post-graduation buyers.");
    }
    if (await enqueueHeliusCurveIndex(result.mint, result.addresses.bondingCurve).catch(() => false)) {
      result.warnings.push("Full Pump.fun curve history indexing started. Each refresh safely processes another historical page.");
    }
    result.indexing.curve = await heliusIndexProgress(result.mint).catch(() => result.indexing.curve);
    store(key, result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ ok: false, code: "SCAN_FAILED", error: message }, { status: 502 });
  }
}

async function scan(mint: PublicKey): Promise<ScanResponse> {
  const rpc = connection();
  const warnings: string[] = [];
  const [supply, mintInfo, metadata] = await Promise.all([rpcRetry(() => rpc.getTokenSupply(mint)), rpcRetry(() => rpc.getAccountInfo(mint)), tokenMetadata(mint.toBase58())]);
  if (!mintInfo) throw new Error("Mint account was not found on Solana mainnet.");
  const decimals = supply.value.decimals;
  const total = BigInt(supply.value.amount);
  const tokenProgram = tokenProgramFor(mintInfo.owner);
  const { bondingCurve, associatedBondingCurve } = deriveBondingCurve(mint, tokenProgram);
  const curveAccount = await rpcRetry(() => rpc.getAccountInfo(bondingCurve));
  const curve = curveAccount?.owner.equals(new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")) ? parseCurveAccount(curveAccount.data) : null;
  const isPumpFun = !!curve;
  const creator = curve?.creator || null;
  const curveBalance = isPumpFun ? await rpcRetry(() => rpc.getTokenAccountBalance(associatedBondingCurve)).then(x => BigInt(x.value.amount)).catch(() => 0n) : 0n;
  const largest = await rpcRetry(() => rpc.getTokenLargestAccounts(mint));
  const accountInfos = await rpcRetry(() => rpc.getMultipleParsedAccounts(largest.value.map(x => x.address)));
  const ownerMap = new Map<string, AccountOwner>();
  for (let i = 0; i < accountInfos.value.length; i++) {
    const account = accountInfos.value[i];
    if (!account || typeof account.data !== "object" || !("parsed" in account.data)) continue;
    const info = account.data.parsed.info as { owner?: string; tokenAmount?: { amount?: string } };
    if (!info.owner || !info.tokenAmount?.amount) continue;
    const old = ownerMap.get(info.owner);
    ownerMap.set(info.owner, { owner: info.owner, tokenAccount: largest.value[i].address.toBase58(), amount: (old?.amount || 0n) + BigInt(info.tokenAmount.amount) });
  }
  const owners = [...ownerMap.values()].sort((a, b) => a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1);
  const labelable = owners.filter(x => x.owner !== bondingCurve.toBase58() && x.owner !== creator && !BURN_ADDRESSES.has(x.owner)).map(x => x.owner);
  const fomo = await resolveFomo(labelable);
  let fomoRaw = 0n, creatorRaw = 0n, burnRaw = 0n;
  const holders: Holder[] = owners.map((item, index) => {
    const fomoHit = fomo.get(item.owner);
    let label: Holder["label"] = "unknown";
    if (item.owner === bondingCurve.toBase58()) label = "pumpfun_curve";
    else if (item.owner === creator) { label = "creator"; creatorRaw += item.amount; }
    else if (BURN_ADDRESSES.has(item.owner)) { label = "burn"; burnRaw += item.amount; }
    else if (fomoHit) { label = "fomo"; fomoRaw += item.amount; }
    return { rank: index + 1, owner: item.owner, tokenAccount: item.tokenAccount, uiAmount: uiAmount(item.amount, decimals), pctOfSupply: pct(item.amount, total), label, fomoHandle: fomoHit?.handle || null, solscan: `https://solscan.io/account/${item.owner}` };
  });
  const knownRaw = curveBalance + fomoRaw + creatorRaw + burnRaw;
  const otherRaw = total > knownRaw ? total - knownRaw : 0n;
  const scannedRaw = owners.reduce((sum, x) => sum + x.amount, 0n);
  const graduated = curve ? curve.complete || curveBalance === 0n : null;
  const initialReserves = 793_100_000n * 10n ** BigInt(decimals);
  const progress = curve ? Math.max(0, Math.min(100, 100 - Number(curve.realTokenReserves * 10000n / initialReserves) / 100)) : null;
  let history = { buyers: [] as Awaited<ReturnType<typeof findCurveBuyers>>["buyers"], buyTxCount: 0, truncated: false };
  if (isPumpFun) {
    try {
      const cap = hasDedicatedRpc() ? 350 : 75;
      history = await findCurveBuyers(rpc, bondingCurve, mint, cap);
      if (!hasDedicatedRpc()) warnings.push("Using public RPC: buyer history is limited to the latest 75 curve transactions. Add HELIUS_API_KEY for a deeper scan.");
    }
    catch { warnings.push("Curve buyer history could not be read from this RPC. Holder labels are still available."); }
  } else warnings.push("This is not a Pump.fun mint; curve and PumpSwap metrics are not applicable.");
  const indexedBuyers = await loadStoredBuyers(mint.toBase58()).catch(() => []);
  const mergedBuyers = new Map<string, { owner: string; venue: Buyer["venue"]; buyTxCount: number; firstBuyAt: string | null }>();
  const rememberBuyer = (item: { owner: string; venue: Buyer["venue"]; buyTxCount: number; firstBuyAt: string | null }) => {
    const id = `${item.owner}:${item.venue}`;
    const previous = mergedBuyers.get(id);
    mergedBuyers.set(id, {
      ...item,
      buyTxCount: Math.max(previous?.buyTxCount || 0, item.buyTxCount),
      firstBuyAt: previous?.firstBuyAt && item.firstBuyAt ? (previous.firstBuyAt < item.firstBuyAt ? previous.firstBuyAt : item.firstBuyAt) : previous?.firstBuyAt || item.firstBuyAt,
    });
  };
  history.buyers.forEach(item => rememberBuyer({ ...item, venue: "curve" }));
  indexedBuyers.forEach(item => rememberBuyer(item));
  const buyerFomo = await resolveFomo([...mergedBuyers.values()].map(x => x.owner));
  const buyerRows: Buyer[] = [...mergedBuyers.values()].map(item => {
    const held = ownerMap.get(item.owner)?.amount || 0n;
    const fomoHit = buyerFomo.get(item.owner);
    return { owner: item.owner, bucket: fomoHit ? "fomo" as const : item.venue === "curve" ? "pumpfun" as const : "other" as const, buyTxCount: item.buyTxCount, firstBuyAt: item.firstBuyAt, stillHolds: held > 0n, uiAmount: uiAmount(held, decimals), pctOfSupply: pct(held, total), fomoHandle: fomoHit?.handle || null, venue: item.venue };
  }).sort((a, b) => b.uiAmount - a.uiAmount || b.buyTxCount - a.buyTxCount);
  const mix = { totalBuyers: buyerRows.length, fomo: emptyMix(), pumpfun: emptyMix(), other: emptyMix() };
  (Object.keys({ fomo: 1, pumpfun: 1, other: 1 }) as Array<keyof typeof mix>).filter(x => x !== "totalBuyers").forEach(bucket => {
    const rows = buyerRows.filter(x => x.bucket === bucket);
    const holding = rows.filter(x => x.stillHolds);
    const held = holding.reduce((sum, x) => sum + (ownerMap.get(x.owner)?.amount || 0n), 0n);
    mix[bucket] = { buyers: rows.length, pctOfBuyers: buyerRows.length ? Math.round(rows.length / buyerRows.length * 1000) / 10 : 0, stillHolding: holding.length, holdRate: rows.length ? Math.round(holding.length / rows.length * 1000) / 10 : 0, pctOfSupply: pct(held, total), buyVolumeSol: null };
  });
  if (history.truncated) warnings.push("Buyer metrics are based on the most recent 350 curve transactions; older buyers may be omitted.");
  if (!process.env.FOMOSCAN_API_KEY && !process.env.FOMOTAGS_BASE) warnings.push("No FOMO index is configured. Add FOMOTAGS_BASE or FOMOSCAN_API_KEY to resolve known FOMO wallets.");
  const duneState = await duneIndexState(mint.toBase58()).catch(() => "not_started");
  const heliusProgress = await heliusIndexProgress(mint.toBase58()).catch(() => ({ state: "not_started", pages: 0, scannedSignatures: 0, buyersFound: 0, decoderVersion: null }));
  const heliusState = heliusProgress.state;
  const dunePending = duneState === "not_started" || duneState === "queued" || duneState === "running";
  if (graduated && dunePending) warnings.push("Post-graduation buyer indexing is in progress; PumpSwap figures will update after the Dune job completes.");
  if (heliusState === "queued" || heliusState === "running") warnings.push(`Full Pump.fun curve history is indexing (${heliusProgress.scannedSignatures} signatures scanned, ${heliusProgress.buyersFound} buyers found); current curve data is a lower bound.`);
  const curveOwners = new Set(buyerRows.filter(x => x.venue === "curve").map(x => x.owner));
  const pumpswapOwners = new Set(buyerRows.filter(x => x.venue === "pumpswap").map(x => x.owner));
  const curveOnly = [...curveOwners].filter(owner => !pumpswapOwners.has(owner)).length;
  const pumpswapOnly = [...pumpswapOwners].filter(owner => !curveOwners.has(owner)).length;
  const bothVenues = [...curveOwners].filter(owner => pumpswapOwners.has(owner)).length;
  return { ok: true, mint: mint.toBase58(), token: { name: metadata?.name || "Solana token", symbol: metadata?.symbol || mint.toBase58().slice(0, 5).toUpperCase(), decimals, image: metadata?.image || null, supplyUi: uiAmount(total, decimals), supplyRaw: total.toString(), isPumpFun, graduated, curveProgressPct: progress }, addresses: { bondingCurve: isPumpFun ? bondingCurve.toBase58() : null, associatedBondingCurve: isPumpFun ? associatedBondingCurve.toBase58() : null, creator }, split: { pumpfunCurvePctOfSupply: isPumpFun ? pct(curveBalance, total) : null, fomoPctOfSupply: pct(fomoRaw, total), fomoPctOfScanned: pct(fomoRaw, scannedRaw), creatorPctOfSupply: pct(creatorRaw, total), lpPctOfSupply: 0, otherPctOfSupply: pct(otherRaw, total), scannedHolderCount: owners.length, coverageNote: `Known FOMO wallets in the top ${owners.length} token accounts only; total-supply % is a lower bound.` }, mix, venues: { curveBuyers: curveOwners.size, pumpswapBuyers: graduated && dunePending ? null : pumpswapOwners.size, curveOnly, pumpswapOnly: graduated && dunePending ? null : pumpswapOnly, bothVenues: graduated && dunePending ? null : bothVenues, newAfterGrad: graduated && dunePending ? null : pumpswapOnly }, pumpfunBuyers: { uniqueBuyers: new Set(buyerRows.map(x => x.owner)).size, buyTxCount: buyerRows.reduce((sum, x) => sum + x.buyTxCount, 0), stillHoldingCount: buyerRows.filter(x => x.stillHolds).length, stillHoldingPctOfSupply: pct(buyerRows.filter(x => x.stillHolds).reduce((sum, x) => sum + (ownerMap.get(x.owner)?.amount || 0n), 0n), total), fomoBuyerCount: buyerRows.filter(x => x.bucket === "fomo").length, truncated: history.truncated || dunePending, method: dunePending ? "helius_curve_plus_dune_pending" : "helius_curve_plus_dune" , wallets: buyerRows.slice(0, 50) }, pumpswapBuyers: { program: PUMPSWAP_PROGRAM, uniqueBuyers: graduated && dunePending ? null : pumpswapOwners.size, truncated: dunePending, method: dunePending ? "dune_indexing" : "dune_indexed" }, indexing: { curve: heliusProgress }, holders, updatedAt: new Date().toISOString(), warnings };
}
