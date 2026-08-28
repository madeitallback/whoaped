import { fetchTrendingTokens } from "@/lib/token-intel/trending";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("limit") || 12);
  try {
    const { tokens, coverage } = await fetchTrendingTokens(Number.isFinite(requested) ? requested : 12);
    return Response.json({ tokens, updatedAt: new Date().toISOString(), coverage }, {
      headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[tokens/trending] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ tokens: [], error: "Trending tokens are temporarily unavailable." }, { status: 503 });
  }
}
