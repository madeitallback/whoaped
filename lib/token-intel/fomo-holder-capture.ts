import type { TokenWalletActivity } from "@/lib/data/contracts";

export type FomoHolderCapture = {
  handle: string;
  amountText: string;
  holdTimeText?: string | null;
  valueUsd?: number | null;
  pnlUsd?: number | null;
  roiPct?: number | null;
};

export type ResolvedFomoHolderCapture = FomoHolderCapture & {
  normalizedHandle: string;
  amountLowUi: number;
  amountHighUi: number;
  wallet: string | null;
  confidence: "unresolved" | "high";
  resolutionMethod: "unique_rounded_balance" | "none";
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
    }];
  });
}
