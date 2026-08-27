export type Source = "manual" | "pump" | "fomo";
export type Chain = "solana" | "evm";

export interface WalletInput {
  address: string;
  chain: Chain;
  verified: boolean;
}

export interface NormalizedTrade {
  id: string;
  signature: string;
  timestamp: number;
  token: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  priceUsd: number | null;
  grossUsd: number | null;
}

export interface ClosedLot {
  token: string;
  symbol: string;
  quantity: number;
  costUsd: number;
  proceedsUsd: number;
  pnlUsd: number;
  holdSeconds: number;
  openedAt: number;
  closedAt: number;
}

export interface WalletMetrics {
  score: number | null;
  closedLots: number;
  realizedPnlUsd: number | null;
  capitalDeployedUsd: number | null;
  capitalWeightedReturn: number | null;
  winRate: number | null;
  medianHoldSeconds: number | null;
  volumeUsd: number | null;
  lastActivityAt: number | null;
  active: boolean;
}

export interface AnalysisProfile {
  id: string;
  dataset?: "pump_daily_v1";
  source: Source;
  label: string;
  handle?: string;
  wallets: WalletInput[];
  metrics: WalletMetrics;
  trades: NormalizedTrade[];
  updatedAt: number;
  status: "ready" | "partial" | "queued" | "failed";
  notices: string[];
}

export interface AnalyzeRequest {
  source: Source;
  label?: string;
  handle?: string;
  solanaAddress?: string;
  evmAddress?: string;
}

export interface WatchlistEntry {
  profileId: string;
  createdAt: number;
}
