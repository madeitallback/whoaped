type SupabaseConfig =
  | { mode: "direct"; url: string; key: string }
  | { mode: "gateway"; url: string; secret: string };

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gatewaySecret = process.env.WHOAPED_SUPABASE_GATEWAY_SECRET;
  if (url && key) return { mode: "direct", url, key };
  if (url && gatewaySecret) return { mode: "gateway", url, secret: gatewaySecret };
  return null;
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}

export async function supabaseRequest(pathname: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  if (config.mode === "gateway") {
    const headers = new Headers(init.headers);
    const prefer = headers.get("Prefer");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    const response = await fetch(`${config.url}/functions/v1/whoaped-data`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-whoaped-gateway-secret": config.secret,
      },
      body: JSON.stringify({ path: pathname, method: init.method ?? "GET", body, prefer }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Supabase gateway request failed (${response.status})${detail ? `: ${detail}` : "."}`);
    }
    return response;
  }
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase request failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return response;
}

export async function supabaseReady() {
  if (!isSupabaseConfigured()) return false;
  try {
    await supabaseRequest("tokens?select=mint&limit=1");
    return true;
  } catch {
    return false;
  }
}
