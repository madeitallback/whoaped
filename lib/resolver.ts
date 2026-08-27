import type { AnalyzeRequest, Source } from "./types";
import { isSolanaAddress } from "./providers";

const FOMO_FINDER_API = "https://api-production-9541.up.railway.app";
const HANDLE = /^[A-Za-z0-9_.-]{1,64}$/;

type FomoFinderPayload = {
  user?: {
    username?: string;
    displayName?: string | null;
    wallets?: {
      solana?: { address?: string | null; status?: string };
      evm?: { address?: string | null; status?: string };
    };
  };
};

export type ResolvedAnalyzeInput = {
  source: Source;
  label?: string;
  handle?: string;
  solanaAddress: string;
  evmAddress?: string;
  notices: string[];
};

function profilePath(value: string, host: "pump" | "fomo") {
  const raw = value.trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    const isHost = host === "pump"
      ? /(^|\.)pump\.fun$/i.test(url.hostname)
      : /(^|\.)fomo\.family$/i.test(url.hostname);
    if (!isHost) return null;
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const index = parts.findIndex((part) => part.toLowerCase() === "profile");
    return index >= 0 ? parts[index + 1] ?? null : null;
  } catch {
    return null;
  }
}

function fomoHandle(value: string) {
  const profile = profilePath(value, "fomo");
  if (profile) return profile.replace(/^@/, "");
  const raw = value.trim().replace(/^@/, "");
  return HANDLE.test(raw) ? raw : null;
}

async function lookupFomo(handle: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${FOMO_FINDER_API}/get-user/${encodeURIComponent(handle.toLowerCase())}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404) throw new Error(`No verified Fomo wallet was found for @${handle}.`);
    if (!response.ok) throw new Error(`Fomo wallet resolution failed (${response.status}). Please retry shortly.`);
    const payload = await response.json() as FomoFinderPayload;
    const user = payload.user;
    const solanaAddress = user?.wallets?.solana?.address?.trim() ?? "";
    if (user?.wallets?.solana?.status !== "verified" || !isSolanaAddress(solanaAddress)) {
      throw new Error(`@${handle} has no verified Solana wallet in the public Fomo wallet index yet.`);
    }
    const evmAddress = user.wallets?.evm?.status === "verified" ? user.wallets.evm.address?.trim() : undefined;
    return {
      solanaAddress,
      evmAddress: evmAddress || undefined,
      label: user.displayName?.trim() || user.username?.trim() || handle,
      handle: user.username?.trim() || handle,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Fomo wallet resolution timed out. Please retry.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves only explicit URLs/handles the user submits; it does not crawl profile pages. */
export async function resolveAnalyzeInput(input: AnalyzeRequest): Promise<ResolvedAnalyzeInput> {
  const raw = input.solanaAddress?.trim() || "";
  const pumpAddress = profilePath(raw, "pump");
  const handle = fomoHandle(raw) || input.handle?.trim().replace(/^@/, "");
  // A bare non-wallet handle is treated as Fomo, so the primary app input can
  // be used without first selecting a source tab.
  const isFomo = Boolean(profilePath(raw, "fomo")) || (Boolean(handle) && !pumpAddress && !isSolanaAddress(raw));

  if (isFomo) {
    if (!handle || !HANDLE.test(handle)) throw new Error("Enter a Fomo profile URL or a valid @handle.");
    const found = await lookupFomo(handle);
    return {
      source: "fomo",
      label: input.label?.trim() || found.label,
      handle: found.handle,
      solanaAddress: found.solanaAddress,
      evmAddress: input.evmAddress?.trim() || found.evmAddress,
      notices: ["Fomo wallet resolved from its public verified wallet index."],
    };
  }

  const solanaAddress = pumpAddress || raw;
  if (!isSolanaAddress(solanaAddress)) {
    throw new Error("Paste a Solana wallet, a Pump profile URL, or a Fomo profile URL/@handle.");
  }
  return {
    source: pumpAddress || input.source === "pump" ? "pump" : input.source,
    label: input.label?.trim(),
    handle: input.handle?.trim() || undefined,
    solanaAddress,
    evmAddress: input.evmAddress?.trim() || undefined,
    notices: pumpAddress ? ["Pump wallet resolved directly from the submitted public profile URL."] : [],
  };
}
