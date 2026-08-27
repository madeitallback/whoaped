type PumpProfile = {
  rank: number;
  label: string;
  handle: string;
  wallet: string;
  profileUrl: string;
};

const DIRECTORY_URL = "https://pump.fun/profiles";
const profilePattern = /\["\$","li","([1-9A-HJ-NP-Za-km-z]{32,44})",\{[\s\S]*?"aria-label":"Open ([^"]+)","href":"\/profile\/([^"]+)"/g;

/**
 * Pump publishes this directory without authentication. Keep the source in a
 * server route so browsers do not have to scrape a third-party page directly.
 */
export async function GET() {
  const response = await fetch(DIRECTORY_URL, {
    headers: { "User-Agent": "WHOAPED/1.0 (public-directory-reader)" },
    next: { revalidate: 300 },
  });
  if (!response.ok) return Response.json({ error: "Pump's public directory is unavailable." }, { status: 502 });

  const page = (await response.text()).replace(/\\"/g, '"');
  const profiles: PumpProfile[] = [];
  const seen = new Set<string>();
  for (const match of page.matchAll(profilePattern)) {
    const [, wallet, label, handle] = match;
    if (seen.has(wallet)) continue;
    seen.add(wallet);
    profiles.push({ rank: profiles.length + 1, wallet, label, handle, profileUrl: `https://pump.fun/profile/${encodeURIComponent(handle)}` });
    if (profiles.length === 50) break;
  }
  if (!profiles.length) return Response.json({ error: "Pump's public directory changed format. Try again shortly." }, { status: 502 });
  return Response.json({ profiles, updatedAt: Date.now() });
}
