import { persistFomoIdentities, readStoredFomoIdentitiesByWallet } from "@/lib/data/repository";
import { isSolanaAddress } from "@/lib/providers";
import { resolveFomoWallets } from "@/lib/token-intel/fomoscan";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mint?: string; wallets?: string[]; holderWallets?: string[]; buyerWallets?: string[] };
    const wallets = [...new Set(body.wallets || [])].filter(isSolanaAddress).slice(0, 100);
    if (!wallets.length) return Response.json({ identities: {}, checked: 0, failed: 0 });
    const identities = await readStoredFomoIdentitiesByWallet(wallets);
    const missing = wallets.filter((wallet) => !identities.has(wallet));
    let checked = wallets.length;
    let failed = 0;
    let source: "first_party" | "fomoscan_verified" = "first_party";
    // FomoScan's documented wallet endpoint is the authoritative way to turn
    // an on-chain holder into a Fomo profile when our local evidence has not
    // already captured the mapping.
    if (missing.length && process.env.FOMOSCAN_API_KEY && process.env.FOMOSCAN_FALLBACK_ENABLED !== "false") {
      const live = await resolveFomoWallets(missing);
      for (const [wallet, identity] of live.identities) identities.set(wallet, identity);
      checked = wallets.length - live.failed;
      failed = live.failed;
      source = "fomoscan_verified";
      if (body.mint && isSolanaAddress(body.mint) && live.identities.size) {
        await persistFomoIdentities(body.mint, live.identities, new Set((body.holderWallets || []).filter(isSolanaAddress)), new Set((body.buyerWallets || []).filter(isSolanaAddress))).catch((error) => {
          console.error("[token/fomo] identity persistence failed", { error: error instanceof Error ? error.message : String(error) });
        });
      }
    }
    return Response.json({ identities: Object.fromEntries(identities), checked, failed, persisted: true, source });
  } catch (error) {
    console.error("[token/fomo] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Fomo identity enrichment is temporarily unavailable." }, { status: 502 });
  }
}
