import { persistFomoIdentities } from "@/lib/data/repository";
import { resolveFomoWallets } from "@/lib/token-intel/fomoscan";
import { isSolanaAddress } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mint?: string; wallets?: string[]; holderWallets?: string[]; buyerWallets?: string[] };
    const wallets = [...new Set(body.wallets || [])].filter(isSolanaAddress).slice(0, 100);
    if (!wallets.length) return Response.json({ identities: {}, checked: 0, failed: 0 });
    const result = await resolveFomoWallets(wallets);
    let persisted = false;
    if (body.mint && isSolanaAddress(body.mint)) {
      try {
        persisted = await persistFomoIdentities(body.mint, result.identities, new Set((body.holderWallets || []).filter(isSolanaAddress)), new Set((body.buyerWallets || []).filter(isSolanaAddress)));
      } catch (persistenceError) {
        console.error("[token/fomo] persistence unavailable", { error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError) });
      }
    }
    return Response.json({ identities: Object.fromEntries(result.identities), checked: result.checked, failed: result.failed, persisted });
  } catch (error) {
    console.error("[token/fomo] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Fomo identity enrichment is temporarily unavailable." }, { status: 502 });
  }
}
