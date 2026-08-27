import { analyzeProfile } from "@/lib/profile";
import { saveProfile } from "@/lib/store";
import type { AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as AnalyzeRequest;
    if (!input || !["manual", "pump", "fomo"].includes(input.source)) {
      return Response.json({ error: "Invalid source." }, { status: 400 });
    }
    const profile = await analyzeProfile(input);
    try {
      await saveProfile(profile);
    } catch {
      // Keep the on-chain result usable if shared storage is temporarily unavailable.
      // The client can still render an inline profile card; it just will not survive reload.
      profile.status = "partial";
      profile.notices.push("Shared leaderboard storage is temporarily unavailable. This live result will not be saved until Supabase access is restored.");
    }
    return Response.json(profile, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Analysis failed." }, { status: 400 });
  }
}
