import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const bootstrapToken = process.env.FOMO_BOOTSTRAP_TOKEN;
const target = (process.env.WHOAPED_BOOTSTRAP_URL || "https://www.whoaped.xyz").replace(/\/$/, "");
if (!executablePath) throw new Error("Chrome or Edge is required for the one-time Fomo connection.");
if (!workerSecret && !bootstrapToken) throw new Error("A short-lived FOMO_BOOTSTRAP_TOKEN or WORKER_SECRET is required.");

const debugPort = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return reject(new Error("Could not reserve a local browser port."));
    server.close((error) => error ? reject(error) : resolve(address.port));
  });
});
const profileDir = mkdtempSync(join(tmpdir(), "whoaped-fomo-"));
const browserProcess = spawn(executablePath, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  "--new-window",
  "about:blank",
], { stdio: "ignore", windowsHide: false });

let browser;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    if (response.ok) {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!browser) {
  browserProcess.kill();
  rmSync(profileDir, { recursive: true, force: true });
  throw new Error("Could not connect to the temporary Chrome/Edge window.");
}

try {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.goto("https://fomo.family/profile/frankdegods", { waitUntil: "domcontentloaded" });
  process.stdout.write("Connect the dedicated WHOAPED account in the opened Fomo window. Waiting for authenticated leaderboard data…\n");
  let authenticatedLeaderboard = false;
  page.on("response", (response) => {
    try {
      const url = new URL(response.url());
      if (url.hostname === "prod-api.fomo.family" && url.pathname.startsWith("/v2/leaderboard") && response.status() === 200) {
        authenticatedLeaderboard = true;
      }
    } catch {}
  });
  const deadline = Date.now() + 10 * 60_000;
  while (!authenticatedLeaderboard && Date.now() < deadline) {
    const leaderboard = page.getByRole("button", { name: "Leaderboard", exact: true });
    if (await leaderboard.isVisible().catch(() => false)) await leaderboard.click().catch(() => undefined);
    await page.waitForTimeout(1_500);
  }
  if (!authenticatedLeaderboard) throw new Error("Fomo login was not completed before the 10-minute timeout.");
  const raw = await context.storageState({ indexedDB: true });
  const storageState = {
    cookies: raw.cookies.filter((cookie) => /(^|\.)fomo\.family$/i.test(cookie.domain.replace(/^\./, ""))),
    origins: raw.origins.filter((origin) => {
      try { return /(^|\.)fomo\.family$/i.test(new URL(origin.origin).hostname); } catch { return false; }
    }),
  };
  const response = await fetch(`${target}/api/platforms/fomo/collector/session`, {
    method: "PUT",
    headers: {
      ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : { "X-Fomo-Bootstrap-Token": bootstrapToken }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ storageState }),
  });
  if (!response.ok) throw new Error(`WHOAPED rejected the Fomo session (${response.status}): ${(await response.text()).slice(0, 300)}`);
  process.stdout.write("Fomo collector connected. The encrypted cloud session is ready.\n");
} finally {
  await browser.close();
  browserProcess.kill();
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
