import { getPumpFollowerEdge } from "@/lib/pump-follower-edge";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const requestedSample = Number(searchParams.get("sample") ?? 20);
  const sampleSize = Math.max(4, Math.min(40, Number.isFinite(requestedSample) ? Math.floor(requestedSample) : 20));
  try {
    const metrics = await getPumpFollowerEdge(address, sampleSize);
    return Response.json(metrics, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pump Follower Edge failed.";
    const status = message.includes("valid Pump") ? 400 : message.includes("DUNE_API_KEY") ? 503 : message.includes("still queued") ? 504 : 502;
    return Response.json({ error: message }, { status });
  }
}
