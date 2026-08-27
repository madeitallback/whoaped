import type { TokenIndexState } from "@/lib/token-intel/types";

export type SocialPlatform = "pump" | "fomo";
export type IdentityConfidence = "low" | "medium" | "high" | "verified";
export type IngestionJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type CanonicalSocialProfile = {
  id: string;
  platform: SocialPlatform;
  platformProfileId: string;
  handle: string | null;
  displayName: string | null;
  profileUrl: string;
  observedAt: string;
};

export type CanonicalWalletLink = {
  profileId: string;
  wallet: string;
  chain: "solana";
  verificationSource: "platform" | "fomoscan" | "extension" | "manual";
  confidence: IdentityConfidence;
  evidenceUrl: string | null;
  validFrom: string;
  validTo: string | null;
};

export type ThesisEvidence = {
  id: string;
  profileId: string;
  mint: string;
  sourceUrl: string;
  sourceText: string;
  publishedAt: string | null;
  capturedAt: string;
  contentHash: string;
  relevance: "explicit" | "contextual";
};

export type TokenSocialActor = {
  profileId: string;
  platform: SocialPlatform;
  platformProfileId: string;
  handle: string | null;
  displayName: string | null;
  profileUrl: string;
  wallet: string;
  relationship: "buyer" | "holder" | "both" | "observed";
  confidence: IdentityConfidence;
  observedAt: string;
};

export type TokenThesisEvidence = ThesisEvidence & {
  platform: SocialPlatform;
  platformProfileId: string;
  handle: string | null;
  displayName: string | null;
  profileUrl: string;
};

export type PersistedCoverage = {
  holderState: TokenIndexState;
  buyerState: TokenIndexState;
  labelState: "not_started" | "partial" | "complete" | "failed";
  scannedSignatures: number;
  signatureLimit: number;
  holdersShown: number;
  labelsChecked: number;
};
