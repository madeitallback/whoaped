import { refreshPumpLeaderboard } from "@/lib/pump-leaderboard-refresh";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await refreshPumpLeaderboard(true)) });
  } catch (error) {
    console.error("[pump-leaderboard-refresh] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ ok: false, error: "Pump leaderboard refresh failed." }, { status: 503 });
  }
}
