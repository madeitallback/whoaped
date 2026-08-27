import type { ClosedLot, NormalizedTrade, WalletMetrics } from "@/lib/types";

type OpenLot = {
  token: string;
  symbol: string;
  quantity: number;
  costUsd: number;
  openedAt: number;
};

const numberMedian = (items: number[]) => {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Matches sales to open purchases in FIFO order. Trades without USD values stay visible but do not affect PnL. */
export function closeLotsFIFO(trades: NormalizedTrade[]): ClosedLot[] {
  const open = new Map<string, OpenLot[]>();
  const closed: ClosedLot[] = [];

  for (const trade of [...trades].sort((a, b) => a.timestamp - b.timestamp)) {
    if (!trade.quantity || !trade.grossUsd || trade.grossUsd <= 0) continue;
    const lots = open.get(trade.token) ?? [];

    if (trade.side === "buy") {
      lots.push({
        token: trade.token,
        symbol: trade.symbol,
        quantity: trade.quantity,
        costUsd: trade.grossUsd,
        openedAt: trade.timestamp,
      });
      open.set(trade.token, lots);
      continue;
    }

    let remaining = trade.quantity;
    while (remaining > 0 && lots.length) {
      const lot = lots[0];
      const quantity = Math.min(remaining, lot.quantity);
      const lotFraction = quantity / lot.quantity;
      const costUsd = lot.costUsd * lotFraction;
      const proceedsUsd = trade.grossUsd * (quantity / trade.quantity);
      closed.push({
        token: lot.token,
        symbol: lot.symbol,
        quantity,
        costUsd,
        proceedsUsd,
        pnlUsd: proceedsUsd - costUsd,
        holdSeconds: Math.max(0, trade.timestamp - lot.openedAt),
        openedAt: lot.openedAt,
        closedAt: trade.timestamp,
      });
      lot.quantity -= quantity;
      lot.costUsd -= costUsd;
      remaining -= quantity;
      if (lot.quantity <= 1e-12) lots.shift();
    }
  }

  return closed;
}

export function calculateWalletMetrics(trades: NormalizedTrade[]): WalletMetrics {
  const closed = closeLotsFIFO(trades);
  const capitalDeployedUsd = closed.reduce((sum, lot) => sum + lot.costUsd, 0);
  const realizedPnlUsd = closed.reduce((sum, lot) => sum + lot.pnlUsd, 0);
  const volumeUsd = trades.reduce((sum, trade) => sum + (trade.grossUsd ?? 0), 0);
  const winRate = closed.length ? closed.filter((lot) => lot.pnlUsd > 0).length / closed.length : null;
  const capitalWeightedReturn = capitalDeployedUsd ? realizedPnlUsd / capitalDeployedUsd : null;
  const medianHoldSeconds = numberMedian(closed.map((lot) => lot.holdSeconds));
  const lastActivityAt = trades.length ? Math.max(...trades.map((trade) => trade.timestamp)) : null;
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const trades30d = trades.filter((trade) => trade.timestamp >= thirtyDaysAgo);
  const volume30d = trades30d.reduce((sum, trade) => sum + (trade.grossUsd ?? 0), 0);
  const active = trades30d.length >= 3 && volume30d >= 300;

  // A transparent, bounded score. Hold time is intentionally informational only.
  const score = winRate === null || capitalWeightedReturn === null
    ? null
    : Math.round(100 * (0.6 * clamp((winRate - 0.35) / 0.35) + 0.4 * clamp((capitalWeightedReturn + 0.25) / 1.25)));

  return {
    score,
    closedLots: closed.length,
    realizedPnlUsd: closed.length ? realizedPnlUsd : null,
    capitalDeployedUsd: closed.length ? capitalDeployedUsd : null,
    capitalWeightedReturn,
    winRate,
    medianHoldSeconds,
    volumeUsd: trades.length ? volumeUsd : null,
    lastActivityAt,
    active,
  };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
