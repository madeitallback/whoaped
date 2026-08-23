import { NextResponse } from "next/server";
import { connection } from "@/lib/solana";
export async function GET() {
  try { const slot = await connection().getSlot(); return NextResponse.json({ ok: true, rpc: "reachable", slot, fomoIndexConfigured: Boolean(process.env.FOMOTAGS_BASE || process.env.FOMOSCAN_API_KEY), supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) }); }
  catch { return NextResponse.json({ ok: false, rpc: "unreachable" }, { status: 503 }); }
}
