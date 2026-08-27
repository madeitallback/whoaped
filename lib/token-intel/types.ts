export type TokenIndexState = "partial" | "complete" | "failed";

export type TokenHolder = {
  owner: string;
  tokenAccount: string;
  uiAmount: number;
  pctOfSupply: number;
  label: "curve" | "creator" | "burn" | "fomo" | "unknown";
  fomoHandle: string | null;
};

export type TokenBuyer = {
  owner: string;
  buyTxCount: number;
  firstBuyAt: string | null;
  stillHolds: boolean;
  uiAmount: number;
  pctOfSupply: number;
  fomoHandle: string | null;
  phase: "pre_grad" | "post_grad" | "both";
};

export type TokenScan = {
  ok: true;
  mint: string;
  token: {
    name: string;
    symbol: string;
    image: string | null;
    decimals: number;
    supplyUi: number;
    isPumpFun: boolean;
    graduated: boolean | null;
    curveProgressPct: number | null;
    priceUsd: number | null;
    liquidityUsd: number | null;
  };
  addresses: { bondingCurve: string | null; creator: string | null };
  summary: {
    visibleHolders: number;
    visibleBuyers: number;
    stillHoldingBuyers: number;
    verifiedFomoWallets: number;
    verifiedFomoSupplyPct: number | null;
  };
  coverage: {
    holderState: TokenIndexState;
    buyerState: TokenIndexState;
    labelState: "not_started" | "partial" | "complete" | "failed";
    scannedSignatures: number;
    signatureLimit: number;
    holdersShown: number;
    labelsChecked: number;
    note: string;
  };
  holders: TokenHolder[];
  buyers: TokenBuyer[];
  updatedAt: string;
  warnings: string[];
};

export type FomoIdentity = {
  handle: string | null;
  identityId: string | null;
  avatarUrl?: string | null;
  source: "fomoscan" | "fomotags" | "first_party";
};
