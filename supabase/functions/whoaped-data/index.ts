import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const EXPECTED_SECRET_HASH = "d73c04112f1a656fef06eeb154154fb67864942d1d418a966f38172bfb977c7c";
const ALLOWED_RESOURCES = new Set([
  "profiles", "watchlist", "tokens", "token_positions", "ingestion_jobs",
  "token_buy_events", "token_social_actors", "thesis_evidence",
]);
const ALLOWED_RPCS = new Set([
  "claim_ingestion_jobs", "replace_token_positions", "upsert_fomo_identity_batch",
  "capture_thesis_evidence", "upsert_pump_identity_batch",
]);

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed.", { status: 405 });
  const suppliedSecret = request.headers.get("x-whoaped-gateway-secret") ?? "";
  if (!suppliedSecret || await sha256(suppliedSecret) !== EXPECTED_SECRET_HASH) {
    return new Response("Unauthorized.", { status: 401 });
  }

  let payload: { path?: unknown; method?: unknown; body?: unknown; prefer?: unknown };
  try { payload = await request.json(); } catch { return new Response("Invalid JSON.", { status: 400 }); }
  const path = typeof payload.path === "string" ? payload.path : "";
  const method = typeof payload.method === "string" ? payload.method.toUpperCase() : "GET";
  if (!path || path.length > 2_048 || !/^[A-Za-z0-9_?=.,:%&!()~\/-]+$/.test(path)) {
    return new Response("Invalid data path.", { status: 400 });
  }
  if (!["GET", "POST", "PATCH"].includes(method)) return new Response("Unsupported operation.", { status: 405 });

  const resource = path.split("?")[0];
  if (resource.startsWith("rpc/")) {
    if (!ALLOWED_RPCS.has(resource.slice(4)) || method !== "POST") return new Response("RPC is not allowed.", { status: 403 });
  } else if (!ALLOWED_RESOURCES.has(resource)) {
    return new Response("Resource is not allowed.", { status: 403 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return new Response("Gateway storage is unavailable.", { status: 503 });

  const headers: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
  };
  if (typeof payload.prefer === "string" && payload.prefer.length <= 256) headers.Prefer = payload.prefer;
  const upstream = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(payload.body ?? {}),
  });
  if ([204, 205, 304].includes(upstream.status)) {
    return new Response(null, { status: upstream.status });
  }
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
});
