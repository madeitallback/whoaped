"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/analysis";
import type { SocialBoardPlatform, SocialBoardRow } from "@/lib/social-leaderboard";

type Filter = "all" | SocialBoardPlatform;
type Payload = { rows?: SocialBoardRow[]; capturedAt?: string; methodology?: string; sources?: { fomo: string; pump: string } };
const usd = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1, signDisplay: "always" }).format(value);
const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;

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
      if (body.sources?.pump?.includes("refreshing") && !retried) { retried = true; retry = setTimeout(load, 12_000); }
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Leaderboard unavailable."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void load();
    return () => { controller.abort(); if (retry) clearTimeout(retry); };
  }, []);
  const rows = useMemo(() => {
    const filtered = (payload.rows || []).filter((row) => filter === "all" || row.platform === filter);
    const ordered = [...filtered].sort((a, b) => a.platformRank - b.platformRank || a.platform.localeCompare(b.platform));
    return ordered.slice(0, preview ? 10 : 100);
  }, [filter, payload.rows, preview]);
  return <section className="terminal-panel social-board" aria-live="polite" aria-busy={loading}>
    <header className="section-head"><div><span className="kicker">DAILY SOCIAL LEADERBOARD</span><h2>Pump + Fomo signal board</h2><p>One view, honest ranking windows. No blended vanity score.</p></div><div className="source-health"><span><i className="dot fomo" />FOMO 24H</span><span><i className="dot pump" />PUMP VERIFIED</span></div></header>
    <div className="board-toolbar"><div className="terminal-tabs">{(["all", "fomo", "pump"] as Filter[]).map((item) => <button className={filter === item ? "active" : ""} type="button" onClick={() => setFilter(item)} key={item}>{item === "all" ? "COMBINED" : item.toUpperCase()}</button>)}</div><span className="as-of">{payload.capturedAt ? `AS OF ${new Date(payload.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "LIVE SNAPSHOT"}</span></div>
    {error ? <p className="data-message">{error}</p> : null}
    {!loading && payload.sources?.fomo === "degraded" ? <p className="source-warning">Fomo’s live board is temporarily unreachable. Pump evidence remains available.</p> : null}
    {!loading && payload.sources?.pump?.includes("refreshing") ? <p className="source-warning">Pump’s verified daily batch is refreshing in the background. This board will update automatically.</p> : null}
    <div className="social-table-wrap"><table className="social-table"><thead><tr><th>RANK</th><th>TRADER</th><th>PRIMARY SIGNAL</th><th>WIN RATE</th><th>RETURN</th><th>MEDIAN HOLD</th><th>ACTIVITY / SAMPLE</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><span className="platform-rank">{row.platform === "fomo" ? "F" : "P"}{String(row.platformRank).padStart(2, "0")}</span></td><td><div className="trader-cell">{row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : <span className={`avatar-fallback ${row.platform}`}>{row.label.slice(0, 1).toUpperCase()}</span>}<div><b>{row.label}</b><span>@{row.handle}</span></div><em className={`platform-tag ${row.platform}`}>{row.platform}</em></div></td><td><strong className={(row.primaryMetric ?? 0) >= 0 ? "up" : "down"}>{row.platform === "fomo" ? usd(row.primaryMetric) : row.primaryMetric ?? "—"}</strong><small>{row.metricLabel}</small></td><td>{pct(row.winRate)}</td><td className={(row.weightedReturn ?? 0) >= 0 ? "up" : "down"}>{pct(row.weightedReturn)}</td><td>{formatDuration(row.medianHoldSeconds)}</td><td><b>{row.platform === "fomo" ? `${row.trades24h ?? 0} trades · ${usd(row.volume24hUsd)}` : row.lastActivityAt ? new Date(row.lastActivityAt * 1000).toLocaleDateString() : "Not indexed"}</b><small>{row.sampleLabel}</small></td><td><a href={row.profileUrl} target="_blank" rel="noreferrer">OPEN ↗</a></td></tr>)}{!loading && rows.length === 0 ? <tr><td colSpan={8} className="empty-cell">No ranked traders for this source yet.</td></tr> : null}</tbody></table></div>
    {loading ? <p className="data-message">Loading the live social board…</p> : null}
    <footer className="method-line"><span>ⓘ</span><p>{payload.methodology || "Metrics keep their original source and window."}</p>{preview ? <a href="/leaderboard">FULL BOARD ↗</a> : null}</footer>
  </section>;
}
