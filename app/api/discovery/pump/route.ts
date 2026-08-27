import { fetchPumpDirectory } from "@/lib/pump-directory";

export async function GET() {
  try {
    return Response.json({ profiles: await fetchPumpDirectory(50), updatedAt: Date.now() });
  } catch {
    return Response.json({ error: "Pump's public directory is unavailable." }, { status: 502 });
  }
}
