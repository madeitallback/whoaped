import { fetchDuneWalletSummaries } from "./dune";
import { calculateFollowerEdge, collectionRequiredFollowerEdge, type FollowerEdgeMetrics } from "./follower-edge";
import { persistFomoFollowerSnapshot, readFollowerEdgeSnapshot } from "./data/repository";
import { fetchFomoProfile, parseVisibleFomoFollowers, resolveVisibleFomoFollowers } from "./platforms/fomo/adapter";

export async function getFomoFollowerEdge(handle: string) {
  const profile = await fetchFomoProfile(handle);
  if (!profile) throw new Error("This Fomo profile is not known to FomoScan.");
  const cached = await readFollowerEdgeSnapshot("fomo", profile.platformProfileId);
  return cached ?? collectionRequiredFollowerEdge(profile.handle || handle);
}

export async function calculateFomoFollowerEdge(input: { handle: string; followers: unknown; visibleFollowerCount?: unknown }) {
  const owner = await fetchFomoProfile(input.handle);
  if (!owner) throw new Error("This Fomo profile is not known to FomoScan.");
  const handles = parseVisibleFomoFollowers(input.followers);
  if (!handles.length) throw new Error("No visible Fomo follower profile links were found. Open the Followers list first, then retry.");
  const visibleFollowerCount = typeof input.visibleFollowerCount === "number" && Number.isFinite(input.visibleFollowerCount) && input.visibleFollowerCount >= handles.length
    ? Math.floor(input.visibleFollowerCount)
    : handles.length;
  const { followers, failed } = await resolveVisibleFomoFollowers(handles.slice(0, 100));
  const wallets = [...new Set(followers.flatMap((follower) => follower.verifiedWallet ? [follower.verifiedWallet] : []))].slice(0, 40);
  const summaries = wallets.length ? await fetchDuneWalletSummaries(wallets, 90, 105_000) : [];
  const metrics = calculateFollowerEdge(summaries, {
    visibleFollowers: visibleFollowerCount,
    accessibleFollowers: handles.length,
    sampledFollowers: handles.length,
  }, Date.now(), { platform: "fomo", sampleStrategy: "user-triggered-visible-dom" });
  if (failed) metrics.notices.push(`${failed} visible profile${failed === 1 ? "" : "s"} could not be resolved during this run.`);
  await persistFomoFollowerSnapshot(owner, followers, metrics);
  return metrics;
}

export type { FollowerEdgeMetrics };
