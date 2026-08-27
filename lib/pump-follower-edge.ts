import { unstable_cache } from "next/cache";
import { fetchDuneWalletSummaries } from "./dune";
import { calculateFollowerEdge, unavailableFollowerEdge } from "./follower-edge";
import { samplePumpFollowers } from "./platforms/pump/adapter";

async function calculatePumpFollowerEdge(address: string, sampleSize: number) {
  const sample = await samplePumpFollowers(address, sampleSize);
  if (sample.status === "unavailable") return unavailableFollowerEdge(sample.visibleFollowerCount);
  const wallets = sample.followers.flatMap((follower) => follower.verifiedWallet ? [follower.verifiedWallet] : []);
  if (!wallets.length) return calculateFollowerEdge([], {
    visibleFollowers: sample.visibleFollowerCount,
    accessibleFollowers: sample.accessibleFollowerCount,
    sampledFollowers: 0,
  });
  // Dune can spend tens of seconds in its execution queue even when the SQL
  // itself is fast. Keep the same execution alive instead of starting a
  // duplicate query after the former 45-second client timeout.
  const summaries = await fetchDuneWalletSummaries(wallets, 90, 105_000);
  return calculateFollowerEdge(summaries, {
    visibleFollowers: sample.visibleFollowerCount,
    accessibleFollowers: sample.accessibleFollowerCount,
    sampledFollowers: wallets.length,
  });
}

export const getPumpFollowerEdge = unstable_cache(calculatePumpFollowerEdge, ["pump-follower-edge-v1-sample"], { revalidate: 3600 });
