import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { cached, store } from "@/lib/cache";
import { resolveFomo, type FomoHit } from "@/lib/fomo";
import { findCurveBuyers } from "@/lib/buyers";
import { loadCurrentHolders, loadStoredBuyers, loadVerifiedFomoLabels, loadVerifiedFomoLabelsForMint, persistScan } from "@/lib/supabase";
import { advanceDuneJobs, duneIndexState, enqueueDuneBalanceHistoryIndex, enqueueDuneBuyerIndex } from "@/lib/dune";
import { advanceHeliusJobs, enqueueHeliusCurveIndex, heliusIndexProgress, heliusIndexState } from "@/lib/helius-index";
import { advanceHolderJobs, enqueueHolderIndex, holderIndexProgress } from "@/lib/holder-index";
import { advanceLabelJobs, enqueueLabelIndex, labelIndexProgress } from "@/lib/label-index";
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
    const body = await r.json() as { pairs?: Array<{ chainId: string; baseToken: { address: string; name: string; symbol: string }; quoteToken: { address: string; name: string; symbol: string }; info?: { imageUrl?: string }; priceUsd?: string; liquidity?: { usd?: number } }> };
    const pair = (body.pairs || []).find(x => x.chainId === "solana" && x.baseToken.address === mint) || (body.pairs || []).find(x => x.chainId === "solana" && x.quoteToken.address === mint);
    if (!pair) return null;
    const token = pair.baseToken.address === mint ? pair.baseToken : pair.quoteToken;
    return { name: token.name, symbol: token.symbol, image: pair.info?.imageUrl || null, priceUsd: pair.priceUsd ? Number(pair.priceUsd) || null : null, liquidityUsd: pair.liquidity?.usd || null };
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
    const holderUpdated = await advanceHolderJobs(mint.toBase58()).catch(() => false);
    const labelUpdated = await advanceLabelJobs(mint.toBase58()).catch(() => false);
    const existingDuneState = await duneIndexState(mint.toBase58()).catch(() => "not_started");
    const existingHeliusState = await heliusIndexState(mint.toBase58()).catch(() => "not_started");
    const existingHolderState = await holderIndexProgress(mint.toBase58()).then(progress => progress.state).catch(() => "not_started");
    const existingLabelState = await labelIndexProgress(mint.toBase58()).then(progress => progress.state).catch(() => "not_started");
    const hit = cached<ScanResponse>(key);
    if (hit && !duneUpdated && !heliusUpdated && !holderUpdated && !labelUpdated && existingDuneState !== "failed" && existingHeliusState !== "failed" && existingHolderState !== "failed" && existingLabelState !== "failed") return NextResponse.json(hit);
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
    if (await enqueueDuneBalanceHistoryIndex(result.mint).catch(() => false)) {
      result.warnings.push("Dune daily-balance backfill started. Historical chart points will be marked estimated.");
    }
    if (await enqueueHeliusCurveIndex(result.mint, result.addresses.bondingCurve).catch(() => false)) {
      result.warnings.push("Full Pump.fun curve history indexing started. Each refresh safely processes another historical page.");
    }
    if (await enqueueHolderIndex(result.mint).catch(() => false)) {
      result.warnings.push("Full holder indexing started. The top-account view will be replaced with complete owner coverage when it finishes.");
    }
    if (result.analytics.holderIndexComplete && await enqueueLabelIndex(result.mint).catch(() => false)) {
      result.warnings.push("Verified FOMO label enrichment started. The FOMO supply percentage will increase only when a trusted label is confirmed.");
    }
    result.indexing.curve = await heliusIndexProgress(result.mint).catch(() => result.indexing.curve);
    result.indexing.holders = await holderIndexProgress(result.mint).catch(() => result.indexing.holders);
    result.indexing.labels = await labelIndexProgress(result.mint).catch(() => result.indexing.labels);
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
  const ownerMap = new Map<string, AccountOwner>();
  const indexedHolders = await loadCurrentHolders(mint.toBase58()).catch(() => []);
  const usingFullHolderIndex = indexedHolders.length > 0;
  if (usingFullHolderIndex) {
    indexedHolders.forEach(holder => ownerMap.set(holder.owner, holder));
  } else {
    const largest = await rpcRetry(() => rpc.getTokenLargestAccounts(mint));
    const accountInfos = await rpcRetry(() => rpc.getMultipleParsedAccounts(largest.value.map(x => x.address)));
    for (let i = 0; i < accountInfos.value.length; i++) {
      const account = accountInfos.value[i];
      if (!account || typeof account.data !== "object" || !("parsed" in account.data)) continue;
      const info = account.data.parsed.info as { owner?: string; tokenAmount?: { amount?: string } };
      if (!info.owner || !info.tokenAmount?.amount) continue;
      const old = ownerMap.get(info.owner);
      ownerMap.set(info.owner, { owner: info.owner, tokenAccount: largest.value[i].address.toBase58(), amount: (old?.amount || 0n) + BigInt(info.tokenAmount.amount) });
    }
  }
  const owners = [...ownerMap.values()].sort((a, b) => a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1);
  const labelable = owners.filter(x => x.owner !== bondingCurve.toBase58() && x.owner !== creator && !BURN_ADDRESSES.has(x.owner)).map(x => x.owner);
  const fomoLookup = labelable.slice(0, usingFullHolderIndex ? 500 : labelable.length);
  const storedFomo = await (usingFullHolderIndex ? loadVerifiedFomoLabelsForMint(mint.toBase58()) : loadVerifiedFomoLabels(fomoLookup)).catch(() => new Map());
  const freshFomo = await resolveFomo(fomoLookup.filter(wallet => !storedFomo.has(wallet)).slice(0, 100));
  const fomo = new Map<string, FomoHit>([...storedFomo.entries()].map(([wallet, hit]) => [wallet, hit] as const));
  freshFomo.forEach((hit, wallet) => fomo.set(wallet, hit));
  let fomoRaw = 0n, creatorRaw = 0n, burnRaw = 0n;
  const allHolders: Holder[] = owners.map((item, index) => {
    const fomoHit = fomo.get(item.owner);
    let label: Holder["label"] = "unknown";
    if (item.owner === bondingCurve.toBase58()) label = "pumpfun_curve";
    else if (item.owner === creator) { label = "creator"; creatorRaw += item.amount; }
    else if (BURN_ADDRESSES.has(item.owner)) { label = "burn"; burnRaw += item.amount; }
    else if (fomoHit) { label = "fomo"; fomoRaw += item.amount; }
    return { rank: index + 1, owner: item.owner, tokenAccount: item.tokenAccount, uiAmount: uiAmount(item.amount, decimals), pctOfSupply: pct(item.amount, total), label, fomoHandle: fomoHit?.handle || null, solscan: `https://solscan.io/account/${item.owner}` };
  });
  const holders = allHolders.slice(0, 500);
  const knownRaw = curveBalance + fomoRaw + creatorRaw + burnRaw;
  const otherRaw = total > knownRaw ? total - knownRaw : 0n;
  const scannedRaw = owners.reduce((sum, x) => sum + x.amount, 0n);
  const graduated = curve ? curve.complete || curveBalance === 0n : null;
  const initialReserves = 793_100_000n * 10n ** BigInt(decimals);
  const progress = curve ? Math.max(0, Math.min(100, 100 - Number(curve.realTokenReserves * 10000n / initialReserves) / 100)) : null;
  let history = { buyers: [] as Awaited<ReturnType<typeof findCurveBuyers>>["buyers"], buyTxCount: 0, latestBuy: null as Awaited<ReturnType<typeof findCurveBuyers>>["latestBuy"], truncated: false };
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
  const buyerLookup = [...new Set([...mergedBuyers.values()].map(x => x.owner))].slice(0, 500);
  const storedBuyerFomo = await loadVerifiedFomoLabels(buyerLookup).catch(() => new Map());
  const freshBuyerFomo = await resolveFomo(buyerLookup.filter(wallet => !storedBuyerFomo.has(wallet)).slice(0, 100));
  const buyerFomo = new Map<string, FomoHit>([...storedBuyerFomo.entries()].map(([wallet, hit]) => [wallet, hit] as const));
  freshBuyerFomo.forEach((hit, wallet) => buyerFomo.set(wallet, hit));
  const buyersByOwner = new Map<string, Array<{ owner: string; venue: Buyer["venue"]; buyTxCount: number; firstBuyAt: string | null }>>();
  for (const item of mergedBuyers.values()) {
    const entries = buyersByOwner.get(item.owner) || [];
    entries.push(item);
    buyersByOwner.set(item.owner, entries);
  }
  const buyerRows: Buyer[] = [...buyersByOwner.entries()].map(([owner, entries]) => {
    const venues = entries.map(entry => entry.venue);
    const hasCurve = venues.includes("curve");
    const hasPumpSwap = venues.includes("pumpswap");
    const phase: Buyer["phase"] = hasCurve && hasPumpSwap ? "both" : hasCurve ? "curve_only" : hasPumpSwap ? "pumpswap_only" : "other_dex";
    const primaryVenue: Buyer["venue"] = hasCurve ? "curve" : hasPumpSwap ? "pumpswap" : "other_dex";
    const held = ownerMap.get(owner)?.amount || 0n;
    const fomoHit = buyerFomo.get(owner);
    return {
      owner,
      bucket: fomoHit ? "fomo" as const : hasCurve ? "pumpfun" as const : "other" as const,
      buyTxCount: entries.reduce((sum, entry) => sum + entry.buyTxCount, 0),
      firstBuyAt: entries.reduce<string | null>((first, entry) => !first || (entry.firstBuyAt && entry.firstBuyAt < first) ? entry.firstBuyAt : first, null),
      stillHolds: held > 0n,
      uiAmount: uiAmount(held, decimals),
      pctOfSupply: pct(held, total),
      fomoHandle: fomoHit?.handle || null,
      venue: primaryVenue,
      venues,
      phase,
    };
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
  const heliusProgress = await heliusIndexProgress(mint.toBase58()).catch(() => ({ state: "not_started", pages: 0, scannedSignatures: 0, buyersFound: 0, decoderVersion: null, latestBuy: null }));
  const holderProgress = await holderIndexProgress(mint.toBase58()).catch(() => ({ state: "not_started", holderCount: 0, tokenAccountCount: 0, observedAt: null }));
  const labelProgress = await labelIndexProgress(mint.toBase58()).catch(() => ({ state: "not_started", checked: 0, matched: 0 }));
  const heliusState = heliusProgress.state;
  const dunePending = duneState === "not_started" || duneState === "queued" || duneState === "running";
  if (graduated && dunePending) warnings.push("Post-graduation buyer indexing is in progress; PumpSwap figures will update after the Dune job completes.");
  if (heliusState === "queued" || heliusState === "running") warnings.push(`Full Pump.fun curve history is indexing (${heliusProgress.scannedSignatures} signatures scanned, ${heliusProgress.buyersFound} buyers found); current curve data is a lower bound.`);
  if (holderProgress.state === "queued" || holderProgress.state === "running") warnings.push("Full holder indexing is in progress; the current holder table is still a fast top-account view.");
  if (labelProgress.state === "queued" || labelProgress.state === "running") warnings.push(`Verified FOMO labels are indexing (${labelProgress.checked} wallets checked, ${labelProgress.matched} mappings confirmed).`);
  // The durable full-history job is authoritative. A one-page live scan is a
  // useful fast candidate, but must never be presented as confirmed history.
  const graduationBuy = graduated ? heliusProgress.latestBuy || history.latestBuy : null;
  const graduationVerification: "candidate" | "confirmed" = heliusState === "completed" && heliusProgress.latestBuy ? "confirmed" : "candidate";
  const curveOwners = new Set(buyerRows.filter(x => x.venues.includes("curve")).map(x => x.owner));
  const pumpswapOwners = new Set(buyerRows.filter(x => x.venues.includes("pumpswap")).map(x => x.owner));
  const curveOnly = [...curveOwners].filter(owner => !pumpswapOwners.has(owner)).length;
  const pumpswapOnly = [...pumpswapOwners].filter(owner => !curveOwners.has(owner)).length;
  const bothVenues = [...curveOwners].filter(owner => pumpswapOwners.has(owner)).length;
  const preGradSupplyRaw = buyerRows.filter(row => row.venues.includes("curve")).reduce((sum, row) => sum + (ownerMap.get(row.owner)?.amount || 0n), 0n);
  const postGradSupplyRaw = buyerRows.filter(row => row.venues.includes("pumpswap")).reduce((sum, row) => sum + (ownerMap.get(row.owner)?.amount || 0n), 0n);
  return { ok: true, mint: mint.toBase58(), token: { name: metadata?.name || "Solana token", symbol: metadata?.symbol || mint.toBase58().slice(0, 5).toUpperCase(), decimals, image: metadata?.image || null, supplyUi: uiAmount(total, decimals), supplyRaw: total.toString(), isPumpFun, graduated, curveProgressPct: progress, priceUsd: metadata?.priceUsd || null, liquidityUsd: metadata?.liquidityUsd || null }, lifecycle: { graduation: graduationBuy ? { signature: graduationBuy.signature, at: graduationBuy.at, buyer: graduationBuy.owner, verification: graduationVerification } : null }, addresses: { bondingCurve: isPumpFun ? bondingCurve.toBase58() : null, associatedBondingCurve: isPumpFun ? associatedBondingCurve.toBase58() : null, creator }, split: { pumpfunCurvePctOfSupply: isPumpFun ? pct(curveBalance, total) : null, fomoPctOfSupply: pct(fomoRaw, total), fomoPctOfScanned: pct(fomoRaw, scannedRaw), creatorPctOfSupply: pct(creatorRaw, total), lpPctOfSupply: 0, otherPctOfSupply: pct(otherRaw, total), scannedHolderCount: owners.length, fomoCheckedHolderCount: Math.max(fomoLookup.length, labelProgress.checked), coverageNote: usingFullHolderIndex ? `Full holder index: ${owners.length} owners. FOMO labels checked for ${Math.max(fomoLookup.length, labelProgress.checked)}; verified FOMO supply is a lower bound until label enrichment completes.` : `Fast view: top ${owners.length} token accounts only. Full holder indexing is pending; FOMO supply is a lower bound.` }, mix, venues: { curveBuyers: curveOwners.size, pumpswapBuyers: graduated && dunePending ? null : pumpswapOwners.size, curveOnly, pumpswapOnly: graduated && dunePending ? null : pumpswapOnly, bothVenues: graduated && dunePending ? null : bothVenues, newAfterGrad: graduated && dunePending ? null : pumpswapOnly }, pumpfunBuyers: { uniqueBuyers: new Set(buyerRows.map(x => x.owner)).size, buyTxCount: buyerRows.reduce((sum, x) => sum + x.buyTxCount, 0), stillHoldingCount: buyerRows.filter(x => x.stillHolds).length, stillHoldingPctOfSupply: pct(buyerRows.filter(x => x.stillHolds).reduce((sum, x) => sum + (ownerMap.get(x.owner)?.amount || 0n), 0n), total), fomoBuyerCount: buyerRows.filter(x => x.bucket === "fomo").length, truncated: history.truncated || dunePending, method: dunePending ? "helius_curve_plus_dune_pending" : "helius_curve_plus_dune" , wallets: buyerRows.slice(0, 50) }, pumpswapBuyers: { program: PUMPSWAP_PROGRAM, uniqueBuyers: graduated && dunePending ? null : pumpswapOwners.size, truncated: dunePending, method: dunePending ? "dune_indexing" : "dune_indexed" }, indexing: { curve: heliusProgress, holders: holderProgress, labels: labelProgress }, analytics: { fomoSupplyRaw: fomoRaw.toString(), preGradSupplyRaw: preGradSupplyRaw.toString(), postGradSupplyRaw: postGradSupplyRaw.toString(), holderIndexComplete: usingFullHolderIndex && holderProgress.state === "completed" }, holders, updatedAt: new Date().toISOString(), warnings };
}
