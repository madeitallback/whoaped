"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/analysis";
import type { FollowerEdgeMetrics } from "@/lib/follower-edge";
import type { AnalysisProfile, Source } from "@/lib/types";
import { TokenLauncher } from "./token-launcher";
import { TrendingTokens } from "./trending-tokens";

const sourceCopy: Record<Source, { title: string; detail: string }> = {
  manual: { title: "Any trader", detail: "Paste a Solana wallet, Pump profile URL, Fomo profile URL, or @Fomo handle." },
  pump: { title: "Pump", detail: "Paste a Pump profile URL or public Solana wallet." },
  fomo: { title: "Fomo", detail: "Paste a Fomo profile URL or @handle — the verified Solana wallet resolves automatically." },
};
type Feed = "all" | "pump" | "fomo";
type ActivityWindow = "7d" | "30d" | "all";
type PumpDirectoryProfile = { rank: number; label: string; handle: string; wallet: string; profileUrl: string };
const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, signDisplay: "always" }).format(value);
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const shortWallet = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export default function HomePage() {
  const [source, setSource] = useState<Source>("manual");
  const [label, setLabel] = useState("");
  const [handle, setHandle] = useState("");
  const [solanaAddress, setSolanaAddress] = useState("");
  const [evmAddress, setEvmAddress] = useState("");
  const [profile, setProfile] = useState<AnalysisProfile | null>(null);
  const [watchlist, setWatchlist] = useState<AnalysisProfile[]>([]);
  const [leaderboard, setLeaderboard] = useState<AnalysisProfile[]>([]);
  const [pumpDirectory, setPumpDirectory] = useState<PumpDirectoryProfile[]>([]);
  const [pumpDirectoryError, setPumpDirectoryError] = useState("");
  const [followerEdge, setFollowerEdge] = useState<FollowerEdgeMetrics | null>(null);
  const [followerEdgeLabel, setFollowerEdgeLabel] = useState("");
  const [followerEdgeLoading, setFollowerEdgeLoading] = useState(false);
  const [followerEdgeError, setFollowerEdgeError] = useState("");
  const [candidateText, setCandidateText] = useState("");
  const [fomoCandidates, setFomoCandidates] = useState<string[]>([]);
  const [rankedCandidates, setRankedCandidates] = useState<AnalysisProfile[]>([]);
  const [feed, setFeed] = useState<Feed>("all");
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>("30d");
  const [discoveryError, setDiscoveryError] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const copy = sourceCopy[source];
  const lastUpdated = useMemo(() => profile ? new Date(profile.updatedAt).toLocaleString() : "", [profile]);
  const displayedLeaderboard = useMemo(() => {
    const cutoff = activityWindow === "all" ? 0 : Math.floor(Date.now() / 1000) - (activityWindow === "7d" ? 7 : 30) * 86400;
    return leaderboard.filter((item) => feed === "all" || item.source === feed).filter((item) => !cutoff || (item.metrics.lastActivityAt ?? 0) >= cutoff).sort((a, b) => (b.metrics.score ?? -1) - (a.metrics.score ?? -1));
  }, [leaderboard, feed, activityWindow]);
  function mergeLeaderboard(profiles: AnalysisProfile[]) {
    setLeaderboard((current) => {
      const next = new Map(current.map((item) => [item.id, item]));
      profiles.forEach((item) => next.set(item.id, item));
      return [...next.values()];
    });
  }
  async function loadWatchlist() { const response = await fetch("/api/watchlist"); if (response.ok) setWatchlist(await response.json()); }
  async function loadLeaderboard() { const response = await fetch("/api/leaderboard"); if (response.ok) setLeaderboard(await response.json()); }
  async function loadPumpDirectory() {
    setPumpDirectoryError("");
    try {
      const response = await fetch("/api/discovery/pump");
      const rawBody = await response.text();
      const body = rawBody ? JSON.parse(rawBody) as { profiles?: PumpDirectoryProfile[]; error?: string } : {};
      if (!response.ok) throw new Error(body.error || "Pump directory unavailable.");
      setPumpDirectory(body.profiles ?? []);
    } catch (cause) {
      setPumpDirectory([]);
      setPumpDirectoryError(cause instanceof Error ? cause.message : "Pump directory unavailable.");
    }
  }
  async function loadFollowerEdgeWallet(wallet: string, edgeLabel: string) {
    setFollowerEdgeLoading(true); setFollowerEdge(null); setFollowerEdgeError(""); setFollowerEdgeLabel(edgeLabel);
    try {
      const response = await fetch(`/api/platforms/pump/follower-edge?address=${encodeURIComponent(wallet)}&sample=20`);
      const body = await response.json() as FollowerEdgeMetrics & { error?: string };
      if (!response.ok) throw new Error(body.error || "Follower Edge failed.");
      setFollowerEdge(body);
    } catch (cause) { setFollowerEdgeError(cause instanceof Error ? cause.message : "Follower Edge failed."); }
    finally { setFollowerEdgeLoading(false); }
  }
  async function loadFollowerEdge(item: PumpDirectoryProfile) { await loadFollowerEdgeWallet(item.wallet, item.label); }
  useEffect(() => {
    void loadWatchlist(); void loadLeaderboard(); void loadPumpDirectory();
    const params = new URLSearchParams(window.location.search);
    const wallet = params.get("wallet"); if (wallet) setSolanaAddress(wallet);
    const requestedSource = params.get("source"); if (requestedSource === "pump" || requestedSource === "fomo" || requestedSource === "manual") setSource(requestedSource);
    if (params.get("label")) setLabel(params.get("label") ?? "");
    if (params.get("handle")) setHandle(params.get("handle") ?? "");
    const followerWallet = params.get("followerWallet");
    if (followerWallet) void loadFollowerEdgeWallet(followerWallet, params.get("followerLabel") || shortWallet(followerWallet));
    const imported = params.get("candidates");
    if (imported) { try { const decoded = JSON.parse(atob(imported)) as Array<{ source?: string; label?: string; solanaAddress?: string }>; setCandidateText(decoded.map((item) => `${item.source ?? "pump"},${item.label ?? ""},${item.solanaAddress ?? ""}`).join("\n")); } catch { /* malformed extension input */ } }
    const importedFomo = params.get("fomoCandidates");
    if (importedFomo) { try { setFomoCandidates(JSON.parse(atob(importedFomo)) as string[]); } catch { /* malformed extension input */ } }
  }, []);
  useEffect(() => {
    if (!followerEdgeLoading && !followerEdge && !followerEdgeError) return;
    const frame = requestAnimationFrame(() => document.querySelector("#pump-follower-edge")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [followerEdgeLoading, followerEdge, followerEdgeError]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setProfile(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, label, handle, solanaAddress, evmAddress }) });
      const body = await response.json() as AnalysisProfile & { error?: string };
      if (!response.ok) throw new Error(body.error || "Analysis failed.");
      setProfile(body); mergeLeaderboard([body]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis failed."); } finally { setLoading(false); }
  }
  async function addToWatchlist() { if (!profile) return; await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id }) }); await loadWatchlist(); }
  async function rankCandidates(event: React.FormEvent) {
    event.preventDefault(); setDiscovering(true); setDiscoveryError(""); setRankedCandidates([]);
    const candidates = candidateText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [sourceValue = "pump", labelValue = "", addressValue = ""] = line.split(",").map((part) => part.trim()); return { source: sourceValue === "fomo" ? "fomo" : "pump", label: labelValue || undefined, solanaAddress: addressValue }; });
    try {
      const response = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidates }) });
      const body = await response.json() as { profiles?: AnalysisProfile[]; errors?: Array<{ error: string }>; error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to rank candidates.");
      const profiles = body.profiles ?? []; setRankedCandidates(profiles); mergeLeaderboard(profiles);
      if (body.errors?.length) setDiscoveryError(body.errors.map((item) => item.error).join(" "));
    } catch (cause) { setDiscoveryError(cause instanceof Error ? cause.message : "Unable to rank candidates."); } finally { setDiscovering(false); }
  }
  return <main>
    <nav><a className="brand" href="/">WHOAPED.EXE</a><div><span className="live-dot" />SOLANA NETWORK <span className="muted">/ TOKEN + FOLLOWER INTELLIGENCE</span></div></nav>
    <section className="leader-hero"><div><p className="eyebrow">SOCIAL TRADING INTELLIGENCE</p><h1>Find the wallets worth <em>following.</em></h1><p>Import visible Pump or Fomo leaderboard candidates, then inspect their realized on-chain behavior — not screenshots.</p></div><div className="hero-score"><span>WALLET PERFORMANCE BETA</span><b>60% WR + <i>40% R</i></b><small>individual wallet metric · not follower quality</small></div></section>
    <TrendingTokens />
    <TokenLauncher />
    <section className="panel leaderboard-board" id="pump-directory"><div className="board-head"><div><p className="eyebrow">PUBLIC PUMP DIRECTORY / REFRESHES EVERY 5 MIN</p><h2>Most-followed Pump profiles</h2><p>Choose a profile to calculate the live quality of a rank-stratified sample of its active followers.</p></div><a className="import-link" href="https://pump.fun/profiles" target="_blank" rel="noreferrer">OPEN PUMP ↗</a></div><div className="table-wrap"><table><thead><tr><th>#</th><th>PROFILE</th><th>WALLET</th><th>SOURCE</th><th /></tr></thead><tbody>{pumpDirectory.map((item) => <tr key={item.wallet}><td className="rank">{String(item.rank).padStart(2, "0")}</td><td><b>@{item.label}</b><small>pump.fun/{item.handle}</small></td><td><small>{shortWallet(item.wallet)}</small></td><td><span className="source-pill pump">PUMP</span></td><td><button className="row-open" type="button" disabled={followerEdgeLoading} onClick={() => void loadFollowerEdge(item)}>FOLLOWER EDGE ↗</button></td></tr>)}{!pumpDirectory.length && <tr className="table-empty"><td colSpan={5}><b>{pumpDirectoryError || "Loading Pump's public directory…"}</b><span>Try refreshing in a moment.</span></td></tr>}</tbody></table></div><div className="board-footer"><span>{pumpDirectory.length} public Pump profiles</span><span>Follower Edge is calculated on demand and cached. Sample size, coverage, and confidence are always shown.</span></div></section>
    <FollowerEdgeCard metrics={followerEdge} label={followerEdgeLabel} loading={followerEdgeLoading} error={followerEdgeError} />
    <section className="panel leaderboard-board" id="leaderboard">
      <div className="board-head"><div><p className="eyebrow">DISCOVERY FEED</p><h2>WHOAPED Leaderboard</h2><p>Every trader you resolve and analyze is added here automatically.</p></div><a className="import-link" href="#manual-analysis">+ ANALYZE TRADER</a></div>
      <div className="board-controls"><div className="segmented">{(["all", "pump", "fomo"] as Feed[]).map((item) => <button type="button" onClick={() => setFeed(item)} className={feed === item ? "selected" : ""} key={item}>{item === "all" ? "ALL" : item.toUpperCase()}</button>)}</div><div className="segmented">{(["7d", "30d", "all"] as ActivityWindow[]).map((item) => <button type="button" onClick={() => setActivityWindow(item)} className={activityWindow === item ? "selected" : ""} key={item}>{item === "all" ? "ALL ACTIVITY" : `ACTIVE ${item.toUpperCase()}`}</button>)}</div></div>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>TRADER</th><th>SOURCE</th><th>WALLET PERF β</th><th>WIN RATE</th><th>WEIGHTED RETURN</th><th>MEDIAN HOLD</th><th>LAST ACTIVE</th><th /></tr></thead><tbody>{displayedLeaderboard.map((item, index) => <LeaderboardRow key={item.id} profile={item} rank={index + 1} onSelect={() => setProfile(item)} />)}{!displayedLeaderboard.length && <tr className="table-empty"><td colSpan={9}><b>Your leaderboard is ready.</b><span>Paste a Pump/Fomo profile link, a Fomo handle, or a public Solana wallet to add the first trader.</span><a href="#manual-analysis">Analyze a trader ↓</a></td></tr>}</tbody></table></div>
      <div className="board-footer"><span>{displayedLeaderboard.length} analyzed wallets</span><span>Wallet Performance Beta is an individual-wallet estimate. Follower Edge will be a separate social metric with explicit coverage and sample size.</span></div>
    </section>
    <section className="lower-grid leaderboard-summary"><div className="panel watchlist"><div className="panel-head"><div><p className="eyebrow">WATCHLIST</p><h2>Keep an eye on signal.</h2></div><span>{watchlist.length}</span></div>{watchlist.length ? <div className="watch-items">{watchlist.slice(0, 4).map((item) => <button key={item.id} onClick={() => setProfile(item)}><span>{item.label}</span><b>{item.metrics.score ?? "—"}</b><small>WALLET PERF β</small></button>)}</div> : <p className="empty-small">Add an analyzed trader to track their latest on-chain activity.</p>}</div><div className="panel method"><p className="eyebrow">CURRENT WALLET BETA</p><h2>Transparent components.</h2><ul><li>60% normalized realized win rate</li><li>40% normalized capital-weighted return</li><li>Median hold is displayed but not scored</li><li>Follower quality is not included yet</li></ul></div></section>
    <section className="panel discovery" id="import"><div className="panel-head"><div><p className="eyebrow">IMPORT A SHORTLIST</p><h2>Score visible leaderboard traders.</h2></div><span className="badge">USER-TRIGGERED</span></div><p className="hint">One Pump wallet per line: <code>pump,display name,solana wallet</code>. Fomo handles can be entered individually in the resolver below.</p><form onSubmit={rankCandidates}><textarea value={candidateText} onChange={(event) => setCandidateText(event.target.value)} placeholder={"pump,Anglio,2ksQ77e9e5SS6VA6poanRGWfkU3R4R5wZnptbJHb2nx9\npump,another trader,verified Solana wallet"} /><button className="primary" disabled={discovering}>{discovering ? "SCORING WALLETS…" : "ADD TO LEADERBOARD"}</button></form>{discoveryError && <p className="error">{discoveryError}</p>}{rankedCandidates.length > 0 && <p className="success">{rankedCandidates.length} wallet{rankedCandidates.length === 1 ? "" : "s"} scored and added to your leaderboard.</p>}{fomoCandidates.length > 0 && <div className="fomo-queue"><p className="eyebrow">FOMO CANDIDATES</p><p className="hint">Select a trader to resolve their public verified wallet and run the analysis.</p><div className="ranked-list">{fomoCandidates.map((candidate) => <button type="button" key={candidate} onClick={() => { setSource("fomo"); setSolanaAddress(`@${candidate}`); setHandle(candidate); setLabel(candidate); document.querySelector("#manual-analysis")?.scrollIntoView({ behavior: "smooth" }); }}><span>FOMO</span><b>@{candidate}</b><small>Resolve + analyze</small></button>)}</div></div>}</section>
    <section className="workspace analyzer-area" id="manual-analysis"><form className="panel analyzer" onSubmit={submit}><div className="panel-head"><div><p className="eyebrow">RESOLVE + ANALYZE</p><h2>{copy.title} Wallet</h2></div><span className="badge">ON-CHAIN</span></div><div className="source-tabs">{(Object.keys(sourceCopy) as Source[]).map((item) => <button type="button" className={source === item ? "selected" : ""} onClick={() => setSource(item)} key={item}>{item === "manual" ? "AUTO" : sourceCopy[item].title}</button>)}</div><p className="hint">{copy.detail}</p><label>Profile, handle, or wallet <strong>required</strong><input value={solanaAddress} onChange={(e) => setSolanaAddress(e.target.value)} placeholder="pump.fun/profile/… · fomo.family/profile/… · @handle · Solana wallet" spellCheck={false} /></label><label>Display label <span>optional</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Override the profile name" /></label>{source === "fomo" && <aside className="notice">Fomo profiles resolve through the public verified Fomo wallet index. If it has no verified Solana wallet, the app will say so explicitly.</aside>}{error && <p className="error">{error}</p>}<button className="primary" disabled={loading}>{loading ? "RESOLVING + ANALYZING…" : "RUN LIVE ANALYSIS"}</button></form>{profile ? <ProfileCard profile={profile} updated={lastUpdated} onWatch={addToWatchlist} /> : <EmptyState />}</section>
    <footer className="win-taskbar" aria-label="WHOAPED status bar"><span className="win-start">Start</span><span className="task-app">▣ WHOAPED — Intelligence</span><span className="tray">SOLANA ONLINE</span></footer>
  </main>;
}

function LeaderboardRow({ profile, rank, onSelect }: { profile: AnalysisProfile; rank: number; onSelect: () => void }) { const metrics = profile.metrics; return <tr onClick={onSelect} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onSelect(); }}><td className="rank">{rank < 4 ? `0${rank}` : rank}</td><td><b>{profile.label}</b><small>{shortWallet(profile.wallets[0].address)}</small></td><td><span className={`source-pill ${profile.source}`}>{profile.source}</span></td><td><strong className="alpha-number">{metrics.score ?? "—"}</strong></td><td>{percent(metrics.winRate)}</td><td className={(metrics.capitalWeightedReturn ?? 0) >= 0 ? "positive" : "negative"}>{percent(metrics.capitalWeightedReturn)}</td><td>{formatDuration(metrics.medianHoldSeconds)}</td><td><small>{metrics.lastActivityAt ? new Date(metrics.lastActivityAt * 1000).toLocaleDateString() : "No swaps"}</small></td><td><button className="row-open" type="button" onClick={(event) => { event.stopPropagation(); onSelect(); }}>VIEW ↗</button></td></tr>; }
function EmptyState() { return <section className="panel result empty"><div className="grid-orbit" /><p className="eyebrow">SELECT A TRADER</p><h2>See the flow<br />behind the metrics.</h2><p>Choose any row from the leaderboard, or analyze a public Solana wallet directly.</p><div className="legend"><span><b>01</b> wallet history</span><span><b>02</b> realized FIFO PnL</span><span><b>03</b> performance beta</span></div></section>; }
function ProfileCard({ profile, updated, onWatch }: { profile: AnalysisProfile; updated: string; onWatch: () => void }) { const { metrics } = profile; const contradictsPnl = metrics.score !== null && metrics.score >= 45 && ((metrics.realizedPnlUsd ?? 0) < 0 || (metrics.capitalWeightedReturn ?? 0) < 0); return <section className="panel result"><div className="result-top"><div><p className="eyebrow">{profile.source.toUpperCase()} / WALLET PERFORMANCE</p><h2>{profile.label}</h2><p className="address">{profile.wallets[0].address}</p></div><button className="watch-button" onClick={onWatch}>+ WATCH</button></div><div className="score-row"><div className="score"><span>{metrics.score ?? "—"}</span><small>PERF<br />BETA</small></div><div><p className="score-title">{metrics.score === null ? "Insufficient realized data" : contradictsPnl ? "High win rate, but negative realized performance" : "Individual wallet performance estimate"}</p><p className="muted">60% normalized win rate + 40% normalized capital-weighted return. This is not Follower Edge.</p></div></div>{contradictsPnl && <p className="inline-notice">The beta score and realized result disagree. Review loss size and weighted return instead of relying on the score alone.</p>}<div className="metrics"><Metric label="WIN RATE" value={percent(metrics.winRate)} /><Metric label="WEIGHTED RETURN" value={percent(metrics.capitalWeightedReturn)} tone={(metrics.capitalWeightedReturn ?? 0) >= 0 ? "positive" : "negative"} /><Metric label="MEDIAN HOLD" value={formatDuration(metrics.medianHoldSeconds)} /><Metric label="REALIZED PNL" value={money(metrics.realizedPnlUsd)} tone={(metrics.realizedPnlUsd ?? 0) >= 0 ? "positive" : "negative"} /></div><div className="activity"><span>REALIZED SAMPLE</span><b>{metrics.closedLots} verified closed FIFO lot{metrics.closedLots === 1 ? "" : "s"}</b><span>{profile.trades.length} parsed swap legs · last activity {metrics.lastActivityAt ? new Date(metrics.lastActivityAt * 1000).toLocaleString() : "unknown"} · analyzed {updated}</span></div>{profile.notices.map((notice) => <p className="inline-notice" key={notice}>{notice}</p>)}</section>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div><span>{label}</span><b className={tone}>{value}</b></div>; }

function FollowerEdgeCard({ metrics, label, loading, error }: { metrics: FollowerEdgeMetrics | null; label: string; loading: boolean; error: string }) {
  if (!loading && !metrics && !error) return null;
  return <section className="panel follower-edge-card" id="pump-follower-edge" aria-live="polite" aria-busy={loading}>
    <div className="panel-head"><div><p className="eyebrow">PUMP / FOLLOWER INTELLIGENCE</p><h2>{label ? `@${label}` : "Follower Edge"}</h2></div><span className="badge">90D SAMPLE</span></div>
    {loading && <div className="edge-loading"><b>CALCULATING FOLLOWER EDGE…</b><p>Sampling several depths of the public follower list, then checking active and realized on-chain performance in one Dune batch.</p></div>}
    {error && <p className="error">{error}</p>}
    {metrics && <><div className="edge-primary"><strong>{metrics.followerEdge === null ? "—" : percent(metrics.followerEdge)}</strong><div><span>FOLLOWER EDGE</span><p>{metrics.profitableFollowers} profitable / {metrics.scorableFollowers} scorable active followers</p></div></div><div className="edge-grid"><Metric label="ACTIVE 30D" value={`${metrics.activeFollowers30d} / ${metrics.sampledFollowers}`} /><Metric label="SCORABLE" value={`${metrics.scorableFollowers}`} /><Metric label="MEDIAN FOLLOWER WR" value={percent(metrics.medianFollowerWinRate)} /><Metric label="MEDIAN FOLLOWER RETURN" value={percent(metrics.medianFollowerReturn)} tone={(metrics.medianFollowerReturn ?? 0) >= 0 ? "positive" : "negative"} /><Metric label="PUBLIC SAMPLE" value={`${metrics.sampledFollowers} / ${metrics.visibleFollowers.toLocaleString()}`} /><Metric label="CONFIDENCE" value={metrics.confidence.toUpperCase()} /></div><p className="edge-method">Rank-stratified public sample · {metrics.accessibleFollowers.toLocaleString()} relations accessible through Pump · metric {metrics.metricVersion}</p>{metrics.notices.map((notice) => <p className="inline-notice" key={notice}>{notice}</p>)}</>}
  </section>;
}
