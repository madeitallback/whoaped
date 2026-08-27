import { listProfiles } from "@/lib/store";

export const runtime = "nodejs";

/**
 * The leaderboard contains wallets explicitly analyzed in WHOAPED.
 * It deliberately does not fetch or scrape platform leaderboards itself.
 */
export async function GET() {
  return Response.json(await listProfiles());
}
