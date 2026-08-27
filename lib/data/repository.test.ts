import { afterEach, describe, expect, it, vi } from "vitest";
import { continueIngestionJob, enqueueTokenRefresh, readTokenSocialActors } from "./repository";
import { getSupabaseConfig, supabaseRequest } from "./supabase";

const original = {
  url: process.env.SUPABASE_URL,
  secret: process.env.SUPABASE_SECRET_KEY,
  legacy: process.env.SUPABASE_SERVICE_ROLE_KEY,
  gateway: process.env.WHOAPED_SUPABASE_GATEWAY_SECRET,
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries({ SUPABASE_URL: original.url, SUPABASE_SECRET_KEY: original.secret, SUPABASE_SERVICE_ROLE_KEY: original.legacy, WHOAPED_SUPABASE_GATEWAY_SECRET: original.gateway })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("production data boundary", () => {
  it("stays build-safe and does not fetch when Supabase is absent", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.WHOAPED_SUPABASE_GATEWAY_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(getSupabaseConfig()).toBeNull();
    await expect(enqueueTokenRefresh("mint")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers the server secret and sends it only in Supabase auth headers", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co/";
    process.env.SUPABASE_SECRET_KEY = "server-secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await supabaseRequest("tokens?select=mint&limit=1");
    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/rest/v1/tokens?select=mint&limit=1", expect.objectContaining({
      cache: "no-store",
      headers: expect.objectContaining({ apikey: "server-secret", Authorization: "Bearer server-secret" }),
    }));
  });

  it("uses the scoped Edge Function gateway without exposing a Supabase admin key", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.WHOAPED_SUPABASE_GATEWAY_SECRET = "scoped-gateway-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await supabaseRequest("tokens?select=mint&limit=1");
    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/functions/v1/whoaped-data", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-whoaped-gateway-secret": "scoped-gateway-secret" }),
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ path: "tokens?select=mint&limit=1", method: "GET" });
  });

  it("resets retry attempts after a successful paginated job step", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await continueIngestionJob(42, { cursor: "next-page", pages: 3 });
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({ status: "queued", attempt_count: 0, payload: { cursor: "next-page", pages: 3 } });
  });

  it("normalizes joined token actors without merging unrelated platform identities", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        profile_id: "profile-fomo",
        wallet: "wallet-a",
        relationship: "both",
        confidence: "verified",
        observed_at: "2026-08-26T20:00:00.000Z",
        social_profiles: { platform: "fomo", platform_profile_id: "fomo-a", handle: "alpha", display_name: "Alpha", profile_url: "https://fomo.family/profile/alpha" },
      },
      {
        profile_id: "profile-pump",
        wallet: "wallet-a",
        relationship: "holder",
        confidence: "high",
        observed_at: "2026-08-26T19:00:00.000Z",
        social_profiles: [{ platform: "pump", platform_profile_id: "pump-a", handle: "alpha", display_name: "Alpha", profile_url: "https://pump.fun/profile/alpha" }],
      },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const actors = await readTokenSocialActors("mint-a");
    expect(actors).toHaveLength(2);
    expect(actors.map((actor) => actor.platform)).toEqual(["fomo", "pump"]);
    expect(fetchMock.mock.calls[0][0]).toContain("token_social_actors?mint=eq.mint-a");
  });
});
