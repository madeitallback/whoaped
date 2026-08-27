export type PumpDirectoryProfile = { rank: number; label: string; handle: string; wallet: string; profileUrl: string };

const DIRECTORY_URL = "https://pump.fun/profiles";
const profilePattern = /\["\$","li","([1-9A-HJ-NP-Za-km-z]{32,44})",\{[\s\S]*?"aria-label":"Open ([^"]+)","href":"\/profile\/([^"]+)"/g;

export function parsePumpDirectory(page: string, limit = 50): PumpDirectoryProfile[] {
  const profiles: PumpDirectoryProfile[] = [];
  const seen = new Set<string>();
  for (const match of page.replace(/\\"/g, '"').matchAll(profilePattern)) {
    const [, wallet, label, handle] = match;
    if (seen.has(wallet)) continue;
    seen.add(wallet);
    profiles.push({ rank: profiles.length + 1, wallet, label, handle, profileUrl: `https://pump.fun/profile/${encodeURIComponent(handle)}` });
    if (profiles.length === limit) break;
  }
  return profiles;
}

export async function fetchPumpDirectory(limit = 50) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(DIRECTORY_URL, { headers: { "User-Agent": "WHOAPED/1.0 (public-directory-reader)" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Pump public directory returned ${response.status}.`);
    const profiles = parsePumpDirectory(await response.text(), limit);
    if (!profiles.length) throw new Error("Pump public directory changed format.");
    return profiles;
  } finally { clearTimeout(timer); }
}
