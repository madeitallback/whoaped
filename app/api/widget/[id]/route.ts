import { getProfile } from "@/lib/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const profile = await getProfile(id);
  if (!profile) return Response.json({ error: "Profile not found." }, { status: 404 });
  return Response.json({
    id: profile.id,
    label: profile.label,
    status: profile.status,
    score: profile.metrics.score,
    winRate: profile.metrics.winRate,
    capitalWeightedReturn: profile.metrics.capitalWeightedReturn,
    medianHoldSeconds: profile.metrics.medianHoldSeconds,
    updatedAt: profile.updatedAt,
  }, { headers: { "Cache-Control": "public, max-age=30" } });
}
