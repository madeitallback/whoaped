import { readStoredFomoIdentitiesByWallet } from "@/lib/data/repository";
import { isSolanaAddress } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mint?: string; wallets?: string[]; holderWallets?: string[]; buyerWallets?: string[] };
    const wallets = [...new Set(body.wallets || [])].filter(isSolanaAddress).slice(0, 100);
    if (!wallets.length) return Response.json({ identities: {}, checked: 0, failed: 0 });
    const identities = await readStoredFomoIdentitiesByWallet(wallets);
    return Response.json({ identities: Object.fromEntries(identities), checked: wallets.length, failed: 0, persisted: true, source: "first_party" });
  } catch (error) {
    console.error("[token/fomo] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Fomo identity enrichment is temporarily unavailable." }, { status: 502 });
  }
}
