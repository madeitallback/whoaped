import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();
if (!apiKey || !projectId) throw new Error("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required in .env.local.");

async function request(path, init = {}) {
  const response = await fetch(`https://api.browserbase.com/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-BB-API-Key": apiKey, ...init.headers },
  });
  if (!response.ok) throw new Error(`Browserbase request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.status === 204 ? null : response.json();
}

const contextId = process.env.BROWSERBASE_CONTEXT_ID?.trim()
  || (await request("/contexts", { method: "POST", body: JSON.stringify({ projectId }) })).id;
const session = await request("/sessions", {
  method: "POST",
  body: JSON.stringify({
    projectId,
    timeout: 600,
    region: "us-east-1",
    browserSettings: { context: { id: contextId, persist: true } },
    userMetadata: { service: "whoaped-fomo-bootstrap" },
  }),
});
const browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 30_000 });
try {
  const browserContext = browser.contexts()[0];
  const page = browserContext.pages()[0] || await browserContext.newPage();
  await page.goto("https://fomo.family/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const debug = await request(`/sessions/${encodeURIComponent(session.id)}/debug`);
  const liveUrl = debug.debuggerFullscreenUrl;
  const candidates = process.platform === "win32" ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ] : [];
  const executable = candidates.find(existsSync);
  if (executable) spawn(executable, [liveUrl], { detached: true, stdio: "ignore", windowsHide: false }).unref();
  process.stdout.write(`Browserbase Live View: ${liveUrl}\n`);
  process.stdout.write("Log into the dedicated Fomo account and open Leaderboard. Waiting for authenticated data…\n");
  let authenticated = false;
  page.on("response", (response) => {
    try {
      const url = new URL(response.url());
      if (url.hostname === "prod-api.fomo.family" && url.pathname.startsWith("/v2/leaderboard") && response.status() === 200) authenticated = true;
    } catch {}
  });
  const deadline = Date.now() + 9 * 60_000;
  while (!authenticated && Date.now() < deadline) {
    const leaderboard = page.getByRole("button", { name: "Leaderboard", exact: true });
    if (await leaderboard.isVisible().catch(() => false)) await leaderboard.click().catch(() => undefined);
    await page.waitForTimeout(1_500);
  }
  if (!authenticated) throw new Error("Fomo authentication was not completed before the Browserbase session timeout.");
  process.stdout.write(`Persistent Fomo context ready. Set BROWSERBASE_CONTEXT_ID=${contextId} in Vercel.\n`);
} finally {
  await browser.close().catch(() => undefined);
  await request(`/sessions/${encodeURIComponent(session.id)}`, {
    method: "POST",
    body: JSON.stringify({ status: "REQUEST_RELEASE", projectId }),
  }).catch(() => undefined);
}
