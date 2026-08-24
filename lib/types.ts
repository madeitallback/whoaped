export type HolderLabel = "pumpfun_curve" | "liquidity_pool" | "creator" | "fomo" | "burn" | "cex" | "unknown";
export type BuyerBucket = "fomo" | "pumpfun" | "other";

export interface Holder {
  rank: number;
  owner: string;
  tokenAccount: string;
  uiAmount: number;
  pctOfSupply: number;
  label: HolderLabel;
  fomoHandle: string | null;
  solscan: string;
}

export interface Buyer {
  owner: string;
  bucket: BuyerBucket;
  buyTxCount: number;
  firstBuyAt: string | null;
  stillHolds: boolean;
  uiAmount: number;
  pctOfSupply: number;
  fomoHandle: string | null;
  venue: "curve" | "pumpswap" | "other_dex";
  venues: Array<"curve" | "pumpswap" | "other_dex">;
  phase: "curve_only" | "pumpswap_only" | "both" | "other_dex";
}

export interface BucketMix {
  buyers: number;
  pctOfBuyers: number;
  stillHolding: number;
  holdRate: number;
  pctOfSupply: number;
  buyVolumeSol: number | null;
}

export interface SupplySnapshot {
  observedAt: string;
  fomoPctOfSupply: number;
  preGradPctOfSupply: number;
  postGradPctOfSupply: number;
  holderCount: number;
  fomoCheckedHolderCount: number;
  holderIndexComplete: boolean;
  priceUsd: number | null;
  liquidityUsd: number | null;
  source: "observed" | "dune_estimated";
}

export interface ScanResponse {
  ok: true;
  mint: string;
  token: { name: string; symbol: string; decimals: number; image: string | null; supplyUi: number; supplyRaw: string; isPumpFun: boolean; graduated: boolean | null; curveProgressPct: number | null; priceUsd: number | null; liquidityUsd: number | null };
  lifecycle: { graduation: { signature: string; at: string | null; buyer: string; verification: "candidate" | "confirmed" } | null };
  addresses: { bondingCurve: string | null; associatedBondingCurve: string | null; creator: string | null };
  split: { pumpfunCurvePctOfSupply: number | null; fomoPctOfSupply: number; fomoPctOfScanned: number; creatorPctOfSupply: number; lpPctOfSupply: number; otherPctOfSupply: number; scannedHolderCount: number; fomoCheckedHolderCount: number; coverageNote: string };
  mix: { totalBuyers: number; fomo: BucketMix; pumpfun: BucketMix; other: BucketMix };
  venues: { curveBuyers: number; pumpswapBuyers: number | null; curveOnly: number; pumpswapOnly: number | null; bothVenues: number | null; newAfterGrad: number | null };
  pumpfunBuyers: { uniqueBuyers: number; buyTxCount: number; stillHoldingCount: number; stillHoldingPctOfSupply: number; fomoBuyerCount: number; truncated: boolean; method: string; wallets: Buyer[] };
  pumpswapBuyers: { program: string; uniqueBuyers: number | null; truncated: boolean; method: string };
  indexing: { curve: { state: string; pages: number; scannedSignatures: number; buyersFound: number; decoderVersion: number | null; latestBuy: { signature: string; owner: string; at: string | null } | null }; postGrad: { state: string; pages: number; scannedSignatures: number; buyersFound: number }; holders: { state: string; holderCount: number; tokenAccountCount: number; observedAt: string | null }; labels: { state: string; checked: number; matched: number } };
  analytics: { fomoSupplyRaw: string; preGradSupplyRaw: string; postGradSupplyRaw: string; holderIndexComplete: boolean };
  holders: Holder[];
  updatedAt: string;
  warnings: string[];
}
