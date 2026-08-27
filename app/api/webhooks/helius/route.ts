import { analyzeProfile } from "@/lib/profile";
import { listWatchlist, saveProfile } from "@/lib/store";

export const runtime = "nodejs";

/**
 * The webhook endpoint intentionally performs no broad wallet discovery.
 * Configure Helius only for already watched addresses and set WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || request.headers.get("authorization") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = (await request.json()) as Array<{ signature?: string; accountData?: Array<{ account?: string }> }>;
  // A production worker can re-run the specific profile backfill here. This route avoids trusting
  // payload PnL values and only flags existing local profiles as stale.
  const changedWallets = new Set(events.flatMap((event) => (event.accountData ?? []).map((item) => item.account).filter((item): item is string => Boolean(item))));
  const watched = await listWatchlist();
  const refreshed: string[] = [];
  for (const profile of watched) {
    const solanaWallet = profile.wallets.find((wallet) => wallet.chain === "solana")?.address;
    if (!solanaWallet || !changedWallets.has(solanaWallet)) continue;
    const next = await analyzeProfile({ source: profile.source, label: profile.label, handle: profile.handle, solanaAddress: solanaWallet, evmAddress: profile.wallets.find((wallet) => wallet.chain === "evm")?.address });
    next.id = profile.id;
    await saveProfile(next);
    refreshed.push(profile.id);
  }
  return Response.json({ ok: true, receivedEvents: events.length, refreshed });
}
