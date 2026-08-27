import { isSupabaseConfigured, supabaseReady } from "@/lib/data/supabase";
import { connection } from "@/lib/token-intel/solana";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  const [rpc, database] = await Promise.allSettled([connection().getSlot(), supabaseReady()]);
  const rpcReachable = rpc.status === "fulfilled";
  const databaseReady = database.status === "fulfilled" && database.value;
  const ok = rpcReachable && (!isSupabaseConfigured() || databaseReady);
  return Response.json({
    ok,
    product: "WHOAPED",
    rpc: rpcReachable ? "reachable" : "unreachable",
    slot: rpc.status === "fulfilled" ? rpc.value : null,
    supabaseConfigured: isSupabaseConfigured(),
    supabaseReady: databaseReady,
    providers: {
      helius: Boolean(process.env.HELIUS_API_KEY),
      birdeye: Boolean(process.env.BIRDEYE_API_KEY),
      dune: Boolean(process.env.DUNE_API_KEY),
      fomoscan: Boolean(process.env.FOMOSCAN_API_KEY),
    },
    checkedAt: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}
