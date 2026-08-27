import { getFomoCollectorStatus, setFomoCollectorSession } from "@/lib/data/repository";
import { sanitizeFomoStorageState, sealFomoStorageState } from "@/lib/platforms/fomo/session-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getFomoCollectorStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.WORKER_SECRET || authorization !== `Bearer ${process.env.WORKER_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 800_000) return Response.json({ error: "Session payload is too large." }, { status: 413 });
  try {
    const payload = await request.json() as { storageState?: unknown };
    await setFomoCollectorSession(sealFomoStorageState(sanitizeFomoStorageState(payload.storageState)));
    return Response.json({ ok: true, status: "ready" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid Fomo session." }, { status: 400 });
  }
}
