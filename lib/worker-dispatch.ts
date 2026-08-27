export async function dispatchWorker(requestUrl: string, depth = 0) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;

  const response = await fetch(new URL("/api/worker", requestUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "x-whoaped-drain-depth": String(Math.max(0, depth) + 1) },
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("[worker-dispatch] worker wake failed", { status: response.status });
    return false;
  }
  return true;
}
