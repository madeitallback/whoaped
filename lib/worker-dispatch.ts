export async function dispatchWorker(requestUrl: string) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;

  const response = await fetch(new URL("/api/worker", requestUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("[worker-dispatch] worker wake failed", { status: response.status });
    return false;
  }
  return true;
}
