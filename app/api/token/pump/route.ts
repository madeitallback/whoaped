import { persistPumpIdentities } from "@/lib/data/repository";
import { resolvePumpProfiles } from "@/lib/platforms/pump/adapter";
import { isSolanaAddress } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mint?: string; wallets?: string[]; holderWallets?: string[]; buyerWallets?: string[] };
    const wallets = [...new Set(body.wallets || [])].filter(isSolanaAddress).slice(0, 40);
    if (!wallets.length) return Response.json({ profiles: {}, checked: 0, failed: 0, persisted: false });
    const result = await resolvePumpProfiles(wallets);
    let persisted = false;
    if (body.mint && isSolanaAddress(body.mint)) {
      try {
        persisted = await persistPumpIdentities(body.mint, result.profiles, new Set((body.holderWallets || []).filter(isSolanaAddress)), new Set((body.buyerWallets || []).filter(isSolanaAddress)));
      } catch (persistenceError) {
        console.error("[token/pump] persistence unavailable", { error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError) });
      }
    }
    return Response.json({ profiles: Object.fromEntries(result.profiles), checked: result.checked, failed: result.failed, persisted });
  } catch (error) {
    console.error("[token/pump] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Pump identity enrichment is temporarily unavailable." }, { status: 502 });
  }
}
