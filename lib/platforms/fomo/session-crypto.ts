import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { BrowserContext } from "playwright-core";

export type FomoStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const FOMO_HOST = /(^|\.)fomo\.family$/i;

function encryptionKey() {
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error("WORKER_SECRET is required for the Fomo collector.");
  return createHash("sha256").update("whoaped:fomo-session:v1\0").update(secret).digest();
}

export function sanitizeFomoStorageState(input: unknown): FomoStorageState {
  if (!input || typeof input !== "object") throw new Error("A browser storage state is required.");
  const candidate = input as Partial<FomoStorageState>;
  const cookies = Array.isArray(candidate.cookies)
    ? candidate.cookies.filter((cookie) => cookie && typeof cookie.domain === "string" && FOMO_HOST.test(cookie.domain.replace(/^\./, "")))
    : [];
  const origins = Array.isArray(candidate.origins)
    ? candidate.origins.filter((origin) => {
      try { return FOMO_HOST.test(new URL(origin.origin).hostname); } catch { return false; }
    })
    : [];
  const state = { cookies, origins } as FomoStorageState;
  const bytes = Buffer.byteLength(JSON.stringify(state));
  if (bytes < 20 || bytes > 750_000) throw new Error("The Fomo browser session has an invalid size.");
  return state;
}

export function sealFomoStorageState(state: FomoStorageState) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(sanitizeFomoStorageState(state)), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function openFomoStorageState(sealed: string): FomoStorageState {
  const parts = sealed.split(".");
  if (parts.length !== 3) throw new Error("The encrypted Fomo session is invalid.");
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return sanitizeFomoStorageState(JSON.parse(json));
}
