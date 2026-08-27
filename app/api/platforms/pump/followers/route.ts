import { fetchPumpFollowers, PumpFormatError } from "@/lib/platforms/pump/adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const offset = Number(searchParams.get("offset") ?? 0);
  const limit = Number(searchParams.get("limit") ?? 100);
  try {
    const page = await fetchPumpFollowers(address, offset, limit);
    return Response.json(page, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch (error) {
    if (error instanceof PumpFormatError) return Response.json({ error: error.message, code: error.code }, { status: 502 });
    const message = error instanceof Error ? error.message : "Pump follower discovery failed.";
    const status = message.includes("valid Pump") ? 400 : message.includes("rate limited") ? 429 : 502;
    return Response.json({ error: message }, { status });
  }
}
