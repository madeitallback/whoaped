import { analyzeProfile } from "@/lib/profile";
import { saveProfile } from "@/lib/store";
import type { AnalyzeRequest, AnalysisProfile } from "@/lib/types";

export const runtime = "nodejs";

/** User-triggered batch ranking for a shortlist copied from a visible leaderboard. */
export async function POST(request: Request) {
  try {
    const { candidates } = (await request.json()) as { candidates?: AnalyzeRequest[] };
    if (!Array.isArray(candidates) || !candidates.length) return Response.json({ error: "Add at least one candidate." }, { status: 400 });
    if (candidates.length > 12) return Response.json({ error: "A batch is limited to 12 wallets to protect provider limits." }, { status: 400 });

    const profiles: AnalysisProfile[] = [];
    const errors: Array<{ label?: string; error: string }> = [];
    for (const candidate of candidates) {
      try {
        const profile = await analyzeProfile(candidate);
        await saveProfile(profile);
        profiles.push(profile);
      } catch (error) {
        errors.push({ label: candidate.label, error: error instanceof Error ? error.message : "Analysis failed." });
      }
    }
    profiles.sort((a, b) => (b.metrics.score ?? -1) - (a.metrics.score ?? -1));
    return Response.json({ profiles, errors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Discovery failed." }, { status: 400 });
  }
}
