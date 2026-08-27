import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const candidates = process.platform === "win32"
  ? [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];

const executablePath = candidates.find(existsSync);
const workerSecret = process.env.WORKER_SECRET;
const target = (process.env.WHOAPED_BOOTSTRAP_URL || "https://www.whoaped.xyz").replace(/\/$/, "");
if (!executablePath) throw new Error("Chrome or Edge is required for the one-time Fomo connection.");
if (!workerSecret) throw new Error("Run this command with WORKER_SECRET loaded from .env.local.");

const browser = await chromium.launch({ executablePath, headless: false });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await page.goto("https://fomo.family/profile/frankdegods", { waitUntil: "domcontentloaded" });
  process.stdout.write("Connect the dedicated WHOAPED account in the opened Fomo window. Waiting for the leaderboard…\n");
  await page.getByRole("button", { name: "Leaderboard", exact: true }).waitFor({ state: "visible", timeout: 10 * 60_000 });
  const raw = await context.storageState();
  const storageState = {
    cookies: raw.cookies.filter((cookie) => /(^|\.)fomo\.family$/i.test(cookie.domain.replace(/^\./, ""))),
    origins: raw.origins.filter((origin) => {
      try { return /(^|\.)fomo\.family$/i.test(new URL(origin.origin).hostname); } catch { return false; }
    }),
  };
  const response = await fetch(`${target}/api/platforms/fomo/collector/session`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${workerSecret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ storageState }),
  });
  if (!response.ok) throw new Error(`WHOAPED rejected the Fomo session (${response.status}): ${(await response.text()).slice(0, 300)}`);
  process.stdout.write("Fomo collector connected. The encrypted cloud session is ready.\n");
} finally {
  await browser.close();
}
