import type { DuneWalletSummary } from "./dune";

export interface FollowerEdgeMetrics {
  metricVersion: "follower-v1-sample";
  windowDays: 90;
  visibleFollowers: number;
  accessibleFollowers: number;
  sampledFollowers: number;
  activeFollowers30d: number;
  scorableFollowers: number;
  profitableFollowers: number;
  followerEdge: number | null;
  medianFollowerWinRate: number | null;
  medianFollowerReturn: number | null;
  sampleCoverage: number | null;
  dataCompleteness: number;
  confidence: "low" | "medium" | "high";
  status: "ready" | "insufficient" | "unavailable";
  sampleStrategy: "rank-stratified-public-sample";
  calculatedAt: number;
  notices: string[];
}

const numberOrNull = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function calculateFollowerEdge(
  summaries: DuneWalletSummary[],
  population: { visibleFollowers: number; accessibleFollowers: number; sampledFollowers: number },
  now = Date.now(),
): FollowerEdgeMetrics {
  const active = summaries.filter((summary) => (numberOrNull(summary.swaps_30d) ?? 0) >= 1);
  const scorable = active.filter((summary) =>
    (numberOrNull(summary.closed_positions) ?? 0) >= 3
    && numberOrNull(summary.capital_weighted_return) !== null
    && numberOrNull(summary.win_rate) !== null,
  );
  const profitable = scorable.filter((summary) => (numberOrNull(summary.capital_weighted_return) ?? 0) > 0);
  const sampleCoverage = population.visibleFollowers > 0 ? population.sampledFollowers / population.visibleFollowers : null;
  const dataCompleteness = population.sampledFollowers > 0 ? clamp(summaries.length / population.sampledFollowers) : 1;
  const confidenceScore = 0.4 * clamp(scorable.length / 100)
    + 0.3 * clamp((sampleCoverage ?? 0) / 0.5)
    + 0.3 * dataCompleteness;
  const confidence = confidenceScore >= 0.7 ? "high" : confidenceScore >= 0.4 ? "medium" : "low";
  const followerEdge = scorable.length ? profitable.length / scorable.length : null;

  return {
    metricVersion: "follower-v1-sample",
    windowDays: 90,
    visibleFollowers: population.visibleFollowers,
    accessibleFollowers: population.accessibleFollowers,
    sampledFollowers: population.sampledFollowers,
    activeFollowers30d: active.length,
    scorableFollowers: scorable.length,
    profitableFollowers: profitable.length,
    followerEdge,
    medianFollowerWinRate: median(scorable.map((summary) => numberOrNull(summary.win_rate)!).filter(Number.isFinite)),
    medianFollowerReturn: median(scorable.map((summary) => numberOrNull(summary.capital_weighted_return)!).filter(Number.isFinite)),
    sampleCoverage,
    dataCompleteness,
    confidence,
    status: followerEdge === null ? "insufficient" : "ready",
    sampleStrategy: "rank-stratified-public-sample",
    calculatedAt: now,
    notices: [
      "Follower Edge is the share of active, scorable sampled followers with a positive 90-day capital-weighted realized return.",
      "Active means at least one verified swap in the last 30 days; scorable means at least three closed token positions.",
      "This live beta uses a rank-stratified public Pump sample and always exposes its sample size and coverage.",
    ],
  };
}

export function unavailableFollowerEdge(visibleFollowers: number, now = Date.now()): FollowerEdgeMetrics {
  return {
    metricVersion: "follower-v1-sample",
    windowDays: 90,
    visibleFollowers,
    accessibleFollowers: 0,
    sampledFollowers: 0,
    activeFollowers30d: 0,
    scorableFollowers: 0,
    profitableFollowers: 0,
    followerEdge: null,
    medianFollowerWinRate: null,
    medianFollowerReturn: null,
    sampleCoverage: null,
    dataCompleteness: 0,
    confidence: "low",
    status: "unavailable",
    sampleStrategy: "rank-stratified-public-sample",
    calculatedAt: now,
    notices: ["Pump reports a follower count for this profile but does not expose its public follower list."],
  };
}
