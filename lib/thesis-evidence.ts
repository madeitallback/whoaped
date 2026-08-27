import { createHash } from "node:crypto";
import type { SocialPlatform, ThesisEvidence } from "./data/contracts";
import { isSolanaAddress } from "./providers";

const PLATFORM_HOSTS: Record<SocialPlatform, string[]> = {
  pump: ["pump.fun", "www.pump.fun"],
  fomo: ["fomo.family", "www.fomo.family"],
};

export type ThesisCaptureInput = {
  mint: string;
  platform: SocialPlatform;
  platformProfileId: string;
  handle: string | null;
  displayName: string | null;
  profileUrl: string;
  sourceUrl: string;
  sourceText: string;
  publishedAt: string | null;
  relevance: ThesisEvidence["relevance"];
};

function safePlatformUrl(value: unknown, platform: SocialPlatform, label: string) {
  if (typeof value !== "string" || value.length > 2_048) throw new Error(`${label} is invalid.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} is invalid.`); }
  if (url.protocol !== "https:" || !PLATFORM_HOSTS[platform].includes(url.hostname.toLowerCase())) {
    throw new Error(`${label} must be a public ${platform === "pump" ? "Pump" : "Fomo"} URL.`);
  }
  url.hash = "";
  return url.toString();
}

function optionalLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Profile label is invalid.");
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 128) throw new Error("Profile label is invalid.");
  return normalized;
}

export function parseThesisCapture(value: unknown): ThesisCaptureInput {
  if (!value || typeof value !== "object") throw new Error("A thesis capture payload is required.");
  const input = value as Record<string, unknown>;
  const platform = input.platform;
  if (platform !== "pump" && platform !== "fomo") throw new Error("Platform must be pump or fomo.");
  const mint = typeof input.mint === "string" ? input.mint.trim() : "";
  if (!isSolanaAddress(mint)) throw new Error("A valid Solana mint is required.");
  const platformProfileId = typeof input.platformProfileId === "string" ? input.platformProfileId.trim() : "";
  if (!platformProfileId || platformProfileId.length > 128) throw new Error("A stable platform profile ID is required.");
  const sourceText = typeof input.sourceText === "string"
    ? input.sourceText.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
  if (sourceText.length < 3 || sourceText.length > 4_000) throw new Error("Source text must contain 3 to 4,000 characters.");
  const relevance = input.relevance === "contextual" ? "contextual" : input.relevance === "explicit" ? "explicit" : null;
  if (!relevance) throw new Error("Relevance must be explicit or contextual.");
  let publishedAt: string | null = null;
  if (input.publishedAt !== null && input.publishedAt !== undefined && input.publishedAt !== "") {
    const timestamp = Date.parse(String(input.publishedAt));
    if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2015, 0, 1) || timestamp > Date.now() + 300_000) throw new Error("Published time is invalid.");
    publishedAt = new Date(timestamp).toISOString();
  }
  return {
    mint,
    platform,
    platformProfileId,
    handle: optionalLabel(input.handle),
    displayName: optionalLabel(input.displayName),
    profileUrl: safePlatformUrl(input.profileUrl, platform, "Profile URL"),
    sourceUrl: safePlatformUrl(input.sourceUrl, platform, "Source URL"),
    sourceText,
    publishedAt,
    relevance,
  };
}

export function thesisContentHash(input: ThesisCaptureInput) {
  return createHash("sha256").update(JSON.stringify([
    input.platform,
    input.platformProfileId,
    input.mint,
    input.sourceUrl,
    input.sourceText,
    input.publishedAt,
  ])).digest("hex");
}
