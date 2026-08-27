import { createHash } from "node:crypto";
import { isSolanaAddress } from "../providers";

export type FomoTokenThesis = {
  providerId: string;
  authorId: string;
  authorHandle: string | null;
  authorName: string | null;
  profileUrl: string;
  sourceUrl: string;
  sourceText: string;
  publishedAt: string | null;
  contentHash: string;
  likeCount: number | null;
  holdingsUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  closedAt: string | null;
};

type JsonRecord = Record<string, unknown>;

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function isoFromUnix(value: unknown) {
  const parsed = number(value);
  if (parsed === null) return null;
  const milliseconds = parsed > 10_000_000_000 ? parsed : parsed * 1000;
  const date = new Date(milliseconds);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

export function parseFomoTokenTheses(payload: unknown, mint: string): FomoTokenThesis[] {
  if (!payload || typeof payload !== "object") throw new Error("FomoScan returned an unsupported thesis payload.");
  const rows = Array.isArray((payload as JsonRecord).items) ? (payload as JsonRecord).items as unknown[] : [];
  const seen = new Set<string>();
  const theses: FomoTokenThesis[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as JsonRecord;
    const providerId = text(row.id, 128);
    const authorId = text(row.authorId, 128);
    const sourceText = text(row.thesis, 4_000);
    const tokenAddress = text(row.tokenAddress, 64);
    if (!providerId || !authorId || !sourceText || tokenAddress !== mint || seen.has(providerId)) continue;
    seen.add(providerId);
    const authorHandle = text(row.authorHandle, 128);
    const authorName = text(row.authorName, 128);
    const profileUrl = authorHandle ? `https://fomo.family/profile/${encodeURIComponent(authorHandle)}` : "https://fomo.family/";
    const publishedAt = isoFromUnix(row.fomoCreatedAt);
    const contentHash = createHash("sha256").update(JSON.stringify(["fomoscan", providerId, authorId, mint, sourceText, publishedAt])).digest("hex");
    theses.push({
      providerId, authorId, authorHandle, authorName, profileUrl, sourceUrl: profileUrl, sourceText, publishedAt, contentHash,
      likeCount: number(row.likeCount), holdingsUsd: number(row.holdingsUsd), realizedPnlUsd: number(row.realizedPnlUsd),
      unrealizedPnlUsd: number(row.unrealizedPnlUsd), closedAt: isoFromUnix(row.closedAt),
    });
  }
  return theses;
}

export async function fetchFomoTokenTheses(mint: string) {
  if (!isSolanaAddress(mint)) throw new Error("A valid Solana mint is required.");
  const key = process.env.FOMOSCAN_API_KEY;
  if (!key) return { theses: [] as FomoTokenThesis[], configured: false };
  const base = (process.env.FOMOSCAN_BASE || "https://api.fomoscan.sh").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base}/v2/thesis/token/${encodeURIComponent(mint)}`, {
      cache: "no-store", signal: controller.signal, headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    });
    if (response.status === 404) return { theses: [] as FomoTokenThesis[], configured: true };
    if (!response.ok) throw new Error(`FomoScan thesis feed returned ${response.status}.`);
    return { theses: parseFomoTokenTheses(await response.json(), mint).slice(0, 50), configured: true };
  } finally { clearTimeout(timer); }
}
