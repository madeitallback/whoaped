import { calculateFomoFollowerEdge, getFomoFollowerEdge } from "@/lib/fomo-follower-edge";

export const runtime = "nodejs";
export const maxDuration = 120;

const statusFor = (message: string) => message.includes("valid Fomo") || message.includes("No visible") ? 400
  : message.includes("not configured") ? 503
  : message.includes("rate limited") ? 429
  : message.includes("still queued") ? 504
  : 502;

export async function GET(request: Request) {
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  try {
    return Response.json(await getFomoFollowerEdge(handle), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fomo Follower Edge failed.";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 50_000) return Response.json({ error: "Fomo follower capture is too large." }, { status: 413 });
    const body = await request.json() as { handle?: unknown; followers?: unknown; visibleFollowerCount?: unknown };
    if (typeof body.handle !== "string") return Response.json({ error: "A valid Fomo handle is required." }, { status: 400 });
    const metrics = await calculateFomoFollowerEdge({ handle: body.handle, followers: body.followers, visibleFollowerCount: body.visibleFollowerCount });
    return Response.json(metrics, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fomo Follower Edge failed.";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}
