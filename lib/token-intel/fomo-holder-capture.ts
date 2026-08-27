import type { TokenWalletActivity } from "@/lib/data/contracts";

export type FomoHolderCapture = {
  handle: string;
  amountText: string;
  avatarUrl?: string | null;
  thesisText?: string | null;
  holdTimeText?: string | null;
  valueUsd?: number | null;
  pnlUsd?: number | null;
  roiPct?: number | null;
  trades?: FomoObservedTrade[];
};

export type FomoObservedTrade = {
  side: "buy" | "sell";
  occurredAt: string;
  amountUi?: number | null;
};

export type FomoChainTrade = FomoObservedTrade & {
  signature: string;
  hasFomoMarker: boolean;
};

export type ResolvedFomoHolderCapture = FomoHolderCapture & {
  normalizedHandle: string;
  amountLowUi: number;
  amountHighUi: number;
  wallet: string | null;
  confidence: "unresolved" | "high";
  resolutionMethod: "unique_rounded_balance" | "transaction_fingerprint" | "none";
  resolutionEvidence: Record<string, unknown>;
};

export function compactAmountInterval(input: string): { low: number; high: number } | null {
  const match = input.trim().replace(/,/g, "").match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMB])?$/i);
  if (!match) return null;
  const multiplier = match[2]?.toUpperCase() === "B" ? 1e9 : match[2]?.toUpperCase() === "M" ? 1e6 : match[2]?.toUpperCase() === "K" ? 1e3 : 1;
  const center = Number(match[1]) * multiplier;
  if (!Number.isFinite(center) || center <= 0) return null;
  const decimals = match[1].split(".")[1]?.length ?? 0;
  const quantum = multiplier * (10 ** -decimals);
  return { low: Math.max(0, center - quantum / 2), high: center + quantum / 2 };
}

export function resolveFomoHolderCaptures(captures: FomoHolderCapture[], positions: TokenWalletActivity[]): ResolvedFomoHolderCapture[] {
  return captures.slice(0, 100).flatMap((capture) => {
    const handle = capture.handle.trim().replace(/^@/, "").slice(0, 128);
    const interval = compactAmountInterval(capture.amountText);
    if (!handle || !interval) return [];
    const center = (interval.low + interval.high) / 2;
    const preciseEnough = (interval.high - interval.low) / center <= 0.01;
    const candidates = preciseEnough ? positions.filter((position) => position.balanceUi >= interval.low && position.balanceUi < interval.high) : [];
    const wallet = candidates.length === 1 ? candidates[0].wallet : null;
    return [{
      ...capture,
      handle,
      normalizedHandle: handle.toLowerCase(),
      amountLowUi: interval.low,
      amountHighUi: interval.high,
      wallet,
      confidence: wallet ? "high" : "unresolved",
      resolutionMethod: wallet ? "unique_rounded_balance" : "none",
      resolutionEvidence: wallet ? { candidateCount: 1, balanceUi: candidates[0].balanceUi, resolverVersion: "fomo-identity-v2" } : { candidateCount: candidates.length, resolverVersion: "fomo-identity-v2" },
    }];
  });
}

function validObservedTrades(trades: FomoObservedTrade[] | undefined) {
  return (trades || []).filter((trade) => {
    const timestamp = Date.parse(trade.occurredAt);
    return (trade.side === "buy" || trade.side === "sell") && Number.isFinite(timestamp);
  }).slice(0, 20);
}

export function matchFomoTradeFingerprint(observedInput: FomoObservedTrade[], chain: FomoChainTrade[], toleranceMs = 90_000) {
  const observed = validObservedTrades(observedInput).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const available = [...chain].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const matches: FomoChainTrade[] = [];
  for (const expected of observed) {
    const expectedAt = Date.parse(expected.occurredAt);
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let index = 0; index < available.length; index += 1) {
      const candidate = available[index];
      if (candidate.side !== expected.side) continue;
      const delta = Math.abs(Date.parse(candidate.occurredAt) - expectedAt);
      const amountMatches = expected.amountUi == null || candidate.amountUi == null
        || Math.abs(candidate.amountUi - expected.amountUi) / Math.max(expected.amountUi, 1) <= 0.02;
      if (delta <= toleranceMs && amountMatches && delta < bestDelta) { bestIndex = index; bestDelta = delta; }
    }
    if (bestIndex >= 0) matches.push(...available.splice(bestIndex, 1));
  }
  const markerMatches = matches.filter((trade) => trade.hasFomoMarker).length;
  return { matched: matches.length, expected: observed.length, markerMatches, signatures: matches.map((trade) => trade.signature) };
}

export async function resolveFomoHolderCapturesWithEvidence(
  captures: FomoHolderCapture[],
  positions: TokenWalletActivity[],
  fetchEvidence: (wallet: string, trades: FomoObservedTrade[]) => Promise<FomoChainTrade[]>,
) {
  const base = resolveFomoHolderCaptures(captures, positions);
  return Promise.all(base.map(async (capture) => {
    if (capture.wallet) return capture;
    const observed = validObservedTrades(capture.trades);
    if (observed.length < 2) return capture;
    const candidates = positions.filter((position) => position.balanceUi >= capture.amountLowUi && position.balanceUi < capture.amountHighUi).slice(0, 8);
    if (candidates.length < 2) return capture;
    const fingerprints = await Promise.all(candidates.map(async (candidate) => {
      try { return { wallet: candidate.wallet, result: matchFomoTradeFingerprint(observed, await fetchEvidence(candidate.wallet, observed)) }; }
      catch { return { wallet: candidate.wallet, result: { matched: 0, expected: observed.length, markerMatches: 0, signatures: [] as string[] } }; }
    }));
    const winners = fingerprints.filter(({ result }) => result.matched === result.expected && result.markerMatches >= 1);
    if (winners.length !== 1) return { ...capture, resolutionEvidence: { ...capture.resolutionEvidence, candidateCount: candidates.length, fingerprintMatches: fingerprints.map(({ wallet, result }) => ({ wallet, matched: result.matched, markerMatches: result.markerMatches })) } };
    const winner = winners[0];
    return {
      ...capture,
      wallet: winner.wallet,
      confidence: "high" as const,
      resolutionMethod: "transaction_fingerprint" as const,
      resolutionEvidence: { resolverVersion: "fomo-identity-v2", candidateCount: candidates.length, matchedEvents: winner.result.matched, markerMatches: winner.result.markerMatches, signatures: winner.result.signatures },
    };
  }));
}
