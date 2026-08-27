import { addWatchlist, listWatchlist } from "@/lib/store";

export async function GET() {
  return Response.json(await listWatchlist());
}

export async function POST(request: Request) {
  try {
    const { profileId } = (await request.json()) as { profileId?: string };
    if (!profileId) return Response.json({ error: "profileId is required." }, { status: 400 });
    await addWatchlist(profileId);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add watchlist item." }, { status: 400 });
  }
}
