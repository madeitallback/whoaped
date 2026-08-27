export type Platform = "pump" | "fomo";

export interface PlatformProfileRecord {
  platform: Platform;
  platformProfileId: string;
  handle: string | null;
  displayName: string | null;
  profileUrl: string;
  primaryWallet: string | null;
  visibleFollowerCount: number | null;
}

export interface PlatformFollowerRecord {
  platformFollowerId: string;
  handle: string | null;
  profileUrl: string | null;
  verifiedWallet: string | null;
  resolutionStatus: "verified" | "unresolved" | "ambiguous";
  followerCount: number | null;
}

export interface PlatformFollowerPage {
  followers: PlatformFollowerRecord[];
  nextOffset: number | null;
  source: "public-api" | "embedded-json" | "visible-dom";
  status: "ready" | "unavailable";
}
