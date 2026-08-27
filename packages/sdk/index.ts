export type FollowerAlphaWidget = {
  id: string;
  label: string;
  status: "ready" | "partial" | "queued" | "failed";
  score: number | null;
  winRate: number | null;
  capitalWeightedReturn: number | null;
  medianHoldSeconds: number | null;
  updatedAt: number;
};

/** Small, framework-agnostic client for future Fomo/Pump native integrations. */
export async function getFollowerAlphaWidget(baseUrl: string, profileId: string): Promise<FollowerAlphaWidget> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/widget/${encodeURIComponent(profileId)}`);
  if (!response.ok) throw new Error("WHOAPED widget could not be loaded.");
  return response.json() as Promise<FollowerAlphaWidget>;
}
