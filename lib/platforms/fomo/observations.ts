import type { FomoLeaderboardCaptureItem } from "@/lib/data/repository";

const HANDLE = /^[A-Za-z0-9_.-]{1,64}$/;
const WINDOWS = new Set(["24h", "7d", "30d", "all"]);

function finite(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedText(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : null;
}

function optionalHttpsUrl(value: unknown) {
  const raw = boundedText(value, 2_000);
  if (!raw) return null;
  try { const url = new URL(raw); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

export function parseFomoLeaderboardCapture(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("A Fomo capture payload is required.");
  const body = payload as Record<string, unknown>;
  const sourceUrl = boundedText(body.sourceUrl, 2_000);
  let source: URL;
  try { source = new URL(sourceUrl || ""); } catch { throw new Error("A valid Fomo source URL is required."); }
  if (source.protocol !== "https:" || source.hostname !== "fomo.family") throw new Error("The capture must originate from fomo.family.");
  const window = boundedText(body.window, 8)?.toLowerCase() || "24h";
  if (!WINDOWS.has(window)) throw new Error("A valid Fomo leaderboard window is required.");
  if (!Array.isArray(body.rows) || body.rows.length > 500) throw new Error("Provide at most 500 visible Fomo rows.");
  const seen = new Set<string>();
  const rows = body.rows.flatMap((raw, index): FomoLeaderboardCaptureItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const handle = boundedText(row.handle, 64)?.replace(/^@/, "") || "";
    const normalizedHandle = handle.toLowerCase();
    if (!HANDLE.test(handle) || seen.has(normalizedHandle)) return [];
    seen.add(normalizedHandle);
    const rank = finite(row.platformRank) ?? index + 1;
    if (!Number.isInteger(rank) || rank < 1 || rank > 100_000) return [];
    const tradeCount = finite(row.tradeCount);
    const followerCount = finite(row.followerCount);
    return [{
      normalizedHandle,
      handle,
      displayName: boundedText(row.displayName, 128),
      avatarUrl: optionalHttpsUrl(row.avatarUrl),
      platformRank: rank,
      realizedPnlUsd: finite(row.realizedPnlUsd),
      volumeUsd: finite(row.volumeUsd),
      tradeCount: tradeCount === null ? null : Math.max(0, Math.floor(tradeCount)),
      followerCount: followerCount === null ? null : Math.max(0, Math.floor(followerCount)),
    }];
  });
  if (!rows.length) throw new Error("No valid visible Fomo leaderboard row was found.");
  return { sourceUrl: source.toString(), window: window as "24h" | "7d" | "30d" | "all", rows };
}
