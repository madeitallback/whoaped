"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { formatDuration } from "@/lib/analysis";
import type { SocialBoardPlatform, SocialBoardRow } from "@/lib/social-leaderboard";

type Filter = "all" | SocialBoardPlatform;
type Payload = { rows?: SocialBoardRow[]; capturedAt?: string; methodology?: string; sources?: { fomo: string; pump: string } };
const usd = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1, signDisplay: "always" }).format(value);
const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const metricClass = (value: number | null) => value === null ? "" : value >= 0 ? "up" : "down";
const sortRowsByPnl = (rows: SocialBoardRow[]) => [...rows].sort((left, right) => {
  const pnlDifference = (right.realizedPnlUsd ?? -Infinity) - (left.realizedPnlUsd ?? -Infinity);
  return pnlDifference || left.platformRank - right.platformRank || left.handle.localeCompare(right.handle);
});

export function SocialLeaderboard({ preview = false }: { preview?: boolean }) {
  const [payload, setPayload] = useState<Payload>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | null = null;
    let retried = false;
    const load = () => fetch("/api/leaderboard/social", { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(body.error || "Leaderboard unavailable.");
      setPayload(body);
      if (body.sources?.pump?.includes("refreshing") && !retried) { retried = true; retry = setTimeout(load, 75_000); }
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Leaderboard unavailable."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void load();
    return () => { controller.abort(); if (retry) clearTimeout(retry); };
  }, []);
  const sections = useMemo(() => {
    const platforms: SocialBoardPlatform[] = filter === "all" ? ["fomo", "pump"] : [filter];
    const perPlatformLimit = preview ? 5 : 50;
    return platforms.map((platform) => ({
      platform,
      rows: sortRowsByPnl((payload.rows || []).filter((row) => row.platform === platform)).slice(0, perPlatformLimit),
    })).filter((section) => section.rows.length > 0);
  }, [filter, payload.rows, preview]);
  const rowCount = sections.reduce((count, section) => count + section.rows.length, 0);
  return <section className="terminal-panel social-board" aria-live="polite" aria-busy={loading}>
    <header className="section-head"><div><span className="kicker">DAILY SOCIAL LEADERBOARD</span><h2>Pump + Fomo signal board</h2><p>One view, honest ranking windows. No blended vanity score.</p></div><div className="source-health"><span><i className="dot fomo" />FOMO 24H</span><span><i className="dot pump" />PUMP VERIFIED</span></div></header>
    <div className="board-toolbar"><div className="terminal-tabs">{(["all", "fomo", "pump"] as Filter[]).map((item) => <button className={filter === item ? "active" : ""} type="button" onClick={() => setFilter(item)} key={item}>{item === "all" ? "COMBINED" : item.toUpperCase()}</button>)}</div><span className="as-of">{payload.capturedAt ? `AS OF ${new Date(payload.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "LIVE SNAPSHOT"}</span></div>
    {error ? <p className="data-message">{error}</p> : null}
    {!loading && payload.sources?.fomo === "collection_required" ? <p className="source-warning">Open Fomo’s leaderboard with WHOAPED Companion and sync the visible rows to seed the first-party board.</p> : null}
    {!loading && payload.sources?.fomo === "first_party_cached" ? <p className="source-warning">Fomo is serving the latest authorized first-party capture. Refresh it from the Fomo leaderboard for current ranks.</p> : null}
    {!loading && payload.sources?.pump?.includes("refreshing") ? <p className="source-warning">Pump’s verified daily batch is refreshing in the background. This board will update automatically.</p> : null}
    <div className="social-table-wrap"><table className="social-table"><thead><tr><th>RANK</th><th>TRADER</th><th>REALIZED PNL</th><th>FOLLOWERS</th><th>WIN RATE</th><th>WEIGHTED RETURN</th><th>MEDIAN HOLD</th><th>ACTIVITY / SAMPLE</th><th /></tr></thead><tbody>{sections.flatMap((section) => [
      ...(filter === "all" ? [<tr className="source-group" key={`${section.platform}-heading`}><td colSpan={9}>{section.platform === "fomo" ? "FOMO · REALIZED PNL / 24H" : "PUMP · VERIFIED CLOSED PNL / 90D"}</td></tr>] : []),
      ...section.rows.map((row, index) => <tr key={row.id}><td><span className="platform-rank">#{index + 1}</span></td><td><div className="trader-cell">{row.avatarUrl ? <Image src={row.avatarUrl} alt="" width={32} height={32} sizes="32px" /> : <span className={`avatar-fallback ${row.platform}`}>{row.label.slice(0, 1).toUpperCase()}</span>}<div><b>{row.label}</b><span>@{row.handle}</span></div><em className={`platform-tag ${row.platform}`}>{row.platform}</em></div></td><td><strong className={metricClass(row.realizedPnlUsd)}>{usd(row.realizedPnlUsd)}</strong><small>{row.platform === "fomo" ? "FOMO / ROLLING 24H" : "WHOAPED / 90D CLOSED"}</small></td><td>{row.followers === null ? "—" : row.followers.toLocaleString()}</td><td>{pct(row.winRate)}</td><td className={metricClass(row.weightedReturn)}>{pct(row.weightedReturn)}</td><td>{row.medianHoldSeconds === null ? <span className="muted">NOT INDEXED</span> : formatDuration(row.medianHoldSeconds)}</td><td><b>{row.platform === "fomo" ? `${row.trades24h ?? 0} trades · ${usd(row.volume24hUsd)}` : row.lastActivityAt ? `${new Date(row.lastActivityAt * 1000).toLocaleDateString()}${row.profitFactor !== null ? ` · PF ${row.profitFactor.toFixed(2)}` : ""}` : "Not indexed"}</b><small>{row.platform === "pump" && (row.medianWinnerReturn !== null || row.medianLoserReturn !== null) ? `Med W ${pct(row.medianWinnerReturn)} · L ${pct(row.medianLoserReturn)} · ${row.sampleLabel}` : row.sampleLabel}</small></td><td><a href={row.profileUrl} target="_blank" rel="noreferrer">OPEN ↗</a></td></tr>),
    ])}{!loading && rowCount === 0 ? <tr><td colSpan={9} className="empty-cell">No traders with a reliable closed-position sample for this source yet.</td></tr> : null}</tbody></table></div>
    {loading ? <p className="data-message">Loading the live social board…</p> : null}
    <footer className="method-line"><span>ⓘ</span><p>{payload.methodology || "Metrics keep their original source and window."} Pump win rate needs at least 10 closed positions; median hold appears only after FIFO lot indexing.</p>{preview ? <a href="/leaderboard">FULL BOARD ↗</a> : null}</footer>
  </section>;
}
