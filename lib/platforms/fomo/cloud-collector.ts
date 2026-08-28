import chromiumBinary from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";
import type { FomoLeaderboardCaptureItem } from "@/lib/data/repository";
import { sanitizeFomoStorageState, type FomoStorageState } from "./session-crypto";
import { connectPersistentFomoBrowser, isBrowserbaseConfigured } from "./browserbase";
import type { FomoHolderCapture } from "@/lib/token-intel/fomo-holder-capture";

export type FomoCollectorWindow = "24h" | "7d" | "30d" | "all";
export type FomoCollectorSnapshot = {
  window: FomoCollectorWindow;
  sourceUrl: string;
  rows: FomoLeaderboardCaptureItem[];
};

const WINDOWS: Array<{ label: string; window: FomoCollectorWindow }> = [
  { label: "24H", window: "24h" },
  { label: "7D", window: "7d" },
  { label: "30D", window: "30d" },
  { label: "ALL", window: "all" },
];

async function scrapeFomoLeaderboards(browser: Browser, storageState?: FomoStorageState) {
  const persistentContext = isBrowserbaseConfigured();
  const context = persistentContext
    ? browser.contexts()[0]
    : await browser.newContext({
      storageState: sanitizeFomoStorageState(storageState),
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      serviceWorkers: "block",
    });
  await context.route("**/*", async (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "font" || type === "media") return route.abort();
    return route.continue();
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://fomo.family/", { waitUntil: "domcontentloaded", timeout: 60_000 });

  const leaderboardButton = page.getByRole("button", { name: "Leaderboard", exact: true });
  await leaderboardButton.waitFor({ state: "visible", timeout: 45_000 }).catch(() => {
    throw new Error("The persistent Fomo browser requires a new login.");
  });
  await leaderboardButton.click();

  const snapshots: FomoCollectorSnapshot[] = [];
  for (const item of WINDOWS) {
    const button = page.getByRole("button", { name: item.label, exact: true });
    await button.waitFor({ state: "visible", timeout: 20_000 });
    await button.click();
    const rowsLocator = page.locator('a[data-discover="true"][href^="/profile/"]');
    await rowsLocator.first().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1_200);
    const rows = await rowsLocator.evaluateAll((links) => links.flatMap((link, index) => {
      const href = link.getAttribute("href") || "";
      const handle = decodeURIComponent(href.split("/").filter(Boolean).pop() || "").replace(/^@/, "").slice(0, 64);
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(handle)) return [];
      const translated = Array.from(link.querySelectorAll('[translate="no"]'))
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const displayName = translated.find((value) => !value.startsWith("@") && !value.includes("$")) || handle;
      const leafTexts = Array.from(link.querySelectorAll("*"))
        .filter((node) => node.children.length === 0)
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);
      const moneyText = leafTexts.find((value) => /^[+-]?\$[\d,]+(?:\.\d+)?$/.test(value));
      const realizedPnlUsd = moneyText ? Number(moneyText.replace("$", "").replaceAll(",", "")) : null;
      const compactCount = [...leafTexts].reverse().find((value) => /^\d+\+$/.test(value));
      const avatar = Array.from(link.querySelectorAll("img"))
        .map((image) => image.getAttribute("src"))
        .find((src) => src && !src.includes("/images/fomo-eyes.png") && !src.includes("token-media.defined.fi"));
      let avatarUrl: string | null = null;
      if (avatar) {
        try { avatarUrl = new URL(avatar, document.baseURI).toString(); } catch { avatarUrl = null; }
      }
      return [{ normalizedHandle: handle.toLowerCase(), handle, displayName: displayName.slice(0, 128), avatarUrl, platformRank: index + 1, realizedPnlUsd: Number.isFinite(realizedPnlUsd) ? realizedPnlUsd : null, volumeUsd: null, tradeCount: compactCount ? Number(compactCount.slice(0, -1)) : null, followerCount: null }];
    }));
    if (rows.length < 20) throw new Error(`Fomo returned only ${rows.length} valid ${item.window} leaderboard rows.`);
    snapshots.push({ window: item.window, sourceUrl: "https://fomo.family/", rows: rows.slice(0, 500) });
  }
  const nextStorageState = persistentContext ? null : sanitizeFomoStorageState(await context.storageState({ indexedDB: true }));
  if (!persistentContext) await context.close();
  return { snapshots, storageState: nextStorageState };
}

export async function collectFomoLeaderboards(storageState: FomoStorageState) {
  if (isBrowserbaseConfigured()) {
    const remote = await connectPersistentFomoBrowser();
    try {
      return await scrapeFomoLeaderboards(remote.browser);
    } finally {
      await remote.release();
    }
  }
  let browser: Browser | null = null;
  try {
    chromiumBinary.setGraphicsMode = false;
    browser = await chromium.launch({
      args: chromiumBinary.args,
      executablePath: await chromiumBinary.executablePath(),
      headless: true,
    });
    return await scrapeFomoLeaderboards(browser, storageState);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function collectFomoTokenHolders(mint: string): Promise<{ sourceUrl: string; holders: FomoHolderCapture[] }> {
  if (!isBrowserbaseConfigured()) throw new Error("Persistent Browserbase Fomo collection is not configured.");
  const remote = await connectPersistentFomoBrowser();
  try {
    const context = remote.browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    const sourceUrl = `https://fomo.family/tokens/solana/${encodeURIComponent(mint)}`;
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1_200);
    const pageText = await page.locator("body").innerText();
    // Fomo keeps its global leaderboard mounted beside token pages. If a token
    // is absent, those sidebar links are still visible and must never be
    // recorded as that token's holders.
    if (pageText.includes("Token not found") || !pageText.includes("Holders")) return { sourceUrl, holders: [] };
    const links = page.locator('a[href^="/profile/"]');
    const holders = await links.evaluateAll((nodes) => nodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      // The mounted leaderboard is the left rail (~312px) and account control
      // is at the far right. Token-holder rows live in the central workspace.
      if (rect.x < 360 || rect.x > window.innerWidth - 220 || rect.width < 80 || rect.height < 20) return [];
      const href = node.getAttribute("href") || "";
      const handle = decodeURIComponent(href.split("/").filter(Boolean).pop() || "").replace(/^@/, "").slice(0, 128);
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(handle)) return [];
      const texts = Array.from(node.querySelectorAll("*")).filter((element) => element.children.length === 0).map((element) => (element.textContent || "").trim()).filter(Boolean);
      // Only accept a token-unit value visible on the holder's own row. A
      // rank, follower count, or dollar PnL is not evidence for a wallet map.
      const amountText = texts.find((text) => /^\d+(?:\.\d+)?\s*[KMB]$/i.test(text));
      if (!amountText) return [];
      const avatar = Array.from(node.querySelectorAll("img")).map((image) => image.getAttribute("src")).find(Boolean);
      let avatarUrl: string | null = null;
      try { avatarUrl = avatar ? new URL(avatar, document.baseURI).toString() : null; } catch { avatarUrl = null; }
      return [{ handle, amountText, avatarUrl }];
    }));
    return { sourceUrl, holders: holders.slice(0, 100) };
  } finally {
    await remote.release();
  }
}
