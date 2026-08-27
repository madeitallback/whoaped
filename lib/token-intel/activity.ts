import type { TokenWalletActivity } from "@/lib/data/contracts";

export function positionStatus(balanceUi: number, sellTxCount: number): TokenWalletActivity["status"] {
  if (sellTxCount > 0) return balanceUi > 0 ? "trimmed" : "exited";
  return balanceUi > 0 ? "holding" : "not_held";
}
