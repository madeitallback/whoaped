import { chromium, type Browser } from "playwright-core";

const API_ROOT = "https://api.browserbase.com/v1";

type BrowserbaseConfig = {
  apiKey: string;
  projectId: string;
  contextId: string;
};

type BrowserbaseSession = {
  id: string;
  connectUrl: string;
};

function readConfig(): BrowserbaseConfig | null {
  const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();
  const contextId = process.env.BROWSERBASE_CONTEXT_ID?.trim();
  if (!apiKey && !projectId && !contextId) return null;
  if (!apiKey || !projectId || !contextId) throw new Error("Browserbase requires BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, and BROWSERBASE_CONTEXT_ID.");
  return { apiKey, projectId, contextId };
}

async function browserbaseRequest<T>(config: BrowserbaseConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": config.apiKey,
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Browserbase request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function isBrowserbaseConfigured() {
  return readConfig() !== null;
}

export async function connectPersistentFomoBrowser(): Promise<{ browser: Browser; sessionId: string; release: () => Promise<void> }> {
  const config = readConfig();
  if (!config) throw new Error("Browserbase is not configured.");
  const session = await browserbaseRequest<BrowserbaseSession>(config, "/sessions", {
    method: "POST",
    body: JSON.stringify({
      projectId: config.projectId,
      timeout: 300,
      region: "us-east-1",
      browserSettings: { context: { id: config.contextId, persist: true } },
      userMetadata: { service: "whoaped-fomo-collector" },
    }),
  });
  const browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 30_000 });
  let released = false;
  return {
    browser,
    sessionId: session.id,
    release: async () => {
      if (released) return;
      released = true;
      await browser.close().catch(() => undefined);
      await browserbaseRequest(config, `/sessions/${encodeURIComponent(session.id)}`, {
        method: "POST",
        body: JSON.stringify({ status: "REQUEST_RELEASE", projectId: config.projectId }),
      }).catch(() => undefined);
    },
  };
}
