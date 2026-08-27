import { getProfile } from "@/lib/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const profile = await getProfile(id);
  return profile ? Response.json(profile) : Response.json({ error: "Profile not found." }, { status: 404 });
}
