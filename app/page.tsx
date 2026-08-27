"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/analysis";
import type { FollowerEdgeMetrics } from "@/lib/follower-edge";
import type { AnalysisProfile, Source } from "@/lib/types";
import { TokenLauncher } from "./token-launcher";
import { TrendingTokens } from "./trending-tokens";

const sourceCopy: Record<Source, { title: string; detail: string }> = {
  manual: { title: "Any trader", detail: "Paste a Solana wallet, Pump profile URL, Fomo profile URL, or @Fomo handle." },
  pump: { title: "Pump trader", detail: "Paste a Pump profile URL or its public Solana wallet." },
  fomo: { title: "Fomo trader", detail: "Paste a Fomo profile URL or @handle. WHOAPED resolves only publicly verified wallets." },
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
  const [profile, setProfile] = useState<AnalysisProfile | null>(null);
  const [watchlist, setWatchlist] = useState<AnalysisProfile[]>([]);
  const [leaderboard, setLeaderboard] = useState<AnalysisProfile[]>([]);
  const [pumpDirectory, setPumpDirectory] = useState<PumpDirectoryProfile[]>([]);
  const [followerEdge, setFollowerEdge] = useState<FollowerEdgeMetrics | null>(null);
  const [followerEdgeLabel, setFollowerEdgeLabel] = useState("");
  const [followerEdgePlatform, setFollowerEdgePlatform] = useState<"pump" | "fomo">("pump");
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
  const hasExtensionImport = Boolean(candidateText || fomoCandidates.length);

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
    try {
      const response = await fetch("/api/discovery/pump");
      const body = await response.json() as { profiles?: PumpDirectoryProfile[] };
      if (response.ok) setPumpDirectory(body.profiles ?? []);
    } catch { setPumpDirectory([]); }
  }
  async function loadFollowerEdgeWallet(wallet: string, edgeLabel: string) {
    setFollowerEdgePlatform("pump"); setFollowerEdgeLoading(true); setFollowerEdge(null); setFollowerEdgeError(""); setFollowerEdgeLabel(edgeLabel);
    try {
      const response = await fetch(`/api/platforms/pump/follower-edge?address=${encodeURIComponent(wallet)}&sample=20`);
      const body = await response.json() as FollowerEdgeMetrics & { error?: string };
      if (!response.ok) throw new Error(body.error || "Follower Edge failed.");
      setFollowerEdge(body);
    } catch (cause) { setFollowerEdgeError(cause instanceof Error ? cause.message : "Follower Edge failed."); }
    finally { setFollowerEdgeLoading(false); }
  }
  async function loadFomoFollowerEdge(profileHandle: string, edgeLabel: string) {
    setFollowerEdgePlatform("fomo"); setFollowerEdgeLoading(true); setFollowerEdge(null); setFollowerEdgeError(""); setFollowerEdgeLabel(edgeLabel);
    try {
      const response = await fetch(`/api/platforms/fomo/follower-edge?handle=${encodeURIComponent(profileHandle)}`);
      const body = await response.json() as FollowerEdgeMetrics & { error?: string };
      if (!response.ok) throw new Error(body.error || "Fomo Follower Edge failed.");
      setFollowerEdge(body);
    } catch (cause) { setFollowerEdgeError(cause instanceof Error ? cause.message : "Fomo Follower Edge failed."); }
    finally { setFollowerEdgeLoading(false); }
  }
  useEffect(() => {
    void loadWatchlist(); void loadLeaderboard(); void loadPumpDirectory();
    const params = new URLSearchParams(window.location.search);
    const wallet = params.get("wallet"); if (wallet) setSolanaAddress(wallet);
    const requestedSource = params.get("source"); if (requestedSource === "pump" || requestedSource === "fomo" || requestedSource === "manual") setSource(requestedSource);
    if (params.get("label")) setLabel(params.get("label") ?? "");
    if (params.get("handle")) setHandle(params.get("handle") ?? "");
    const followerWallet = params.get("followerWallet");
    if (followerWallet) void loadFollowerEdgeWallet(followerWallet, params.get("followerLabel") || shortWallet(followerWallet));
    const followerHandle = params.get("followerHandle");
    if (params.get("followerPlatform") === "fomo" && followerHandle) void loadFomoFollowerEdge(followerHandle, params.get("followerLabel") || followerHandle);
    const imported = params.get("candidates");
    if (imported) { try { const decoded = JSON.parse(atob(imported)) as Array<{ source?: string; label?: string; solanaAddress?: string }>; setCandidateText(decoded.map((item) => `${item.source ?? "pump"},${item.label ?? ""},${item.solanaAddress ?? ""}`).join("\n")); } catch { /* malformed extension input */ } }
    const importedFomo = params.get("fomoCandidates");
    if (importedFomo) { try { setFomoCandidates(JSON.parse(atob(importedFomo)) as string[]); } catch { /* malformed extension input */ } }
  }, []);
  useEffect(() => {
    if (!followerEdgeLoading && !followerEdge && !followerEdgeError) return;
    const frame = requestAnimationFrame(() => document.querySelector("#pump-follower-edge")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [followerEdgeLoading, followerEdge, followerEdgeError]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setProfile(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, label, handle, solanaAddress }) });
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
    <nav className="top-nav"><a className="brand" href="/">WHOAPED</a><div className="nav-links"><a href="#explore">Explore tokens</a><a href="#manual-analysis">Analyze trader</a><a href="#method">Method</a></div><span className="network-state"><i className="live-dot" />SOLANA LIVE</span></nav>
    <section className="leader-hero"><div className="hero-copy"><p className="eyebrow">THE SOCIAL INTELLIGENCE LAYER FOR SOLANA</p><h1>Know who <em>aped.</em><br />Know who held.</h1><p>See Pump and Fomo identities on the same token, their verified buys and sells, what they publicly said, and whether the traders following them actually win.</p><div className="hero-actions"><a className="primary-link" href="#explore">EXPLORE LIVE TOKENS ↘</a><a href="#manual-analysis">Analyze a trader</a></div></div><div className="signal-stack" aria-label="WHOAPED signal model"><span className="signal-label">ONE TOKEN. THREE SIGNALS.</span><SignalStep index="01" title="Flow" detail="Verified buys, sells, and current position." /><SignalStep index="02" title="Conviction" detail="Attributable theses and robust hold behavior." /><SignalStep index="03" title="Social edge" detail="Active profitable followers with sample confidence." /></div></section>
    <section id="explore"><TokenLauncher /><TrendingTokens /></section>
    <section className="product-promise" id="method"><div><span>WHAT WHOAPED ANSWERS</span><h2>Not “is this wallet famous?”<br />“Is the signal behind it real?”</h2></div><div className="promise-grid"><p><b>WHO APED?</b> Cross-platform identities mapped to verified wallets.</p><p><b>WHO HELD?</b> Holding, trimmed, and exited states—not a stale holder screenshot.</p><p><b>WHY?</b> Public thesis evidence with source and timestamp.</p><p><b>WHO FOLLOWS?</b> Pump + Fomo Follower Edge with numerator, denominator, and confidence.</p></div></section>
    <section className="workspace analyzer-area" id="manual-analysis"><form className="panel analyzer" onSubmit={submit}><div className="panel-head"><div><p className="eyebrow">TRADER INTELLIGENCE</p><h2>Analyze {copy.title.toLowerCase()}</h2></div><span className="badge">ON-CHAIN</span></div><div className="source-tabs">{(Object.keys(sourceCopy) as Source[]).map((item) => <button type="button" className={source === item ? "selected" : ""} onClick={() => setSource(item)} key={item}>{item === "manual" ? "AUTO" : sourceCopy[item].title}</button>)}</div><p className="hint">{copy.detail}</p><label>Profile, handle, or wallet <strong>required</strong><input value={solanaAddress} onChange={(event) => setSolanaAddress(event.target.value)} placeholder="pump.fun/profile/… · fomo.family/profile/… · @handle · Solana wallet" spellCheck={false} /></label><label>Display label <span>optional</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Override the profile name" /></label>{source === "fomo" && <aside className="notice">Fomo resolution uses public verified wallet mappings. Follower Edge is captured explicitly from the visible Fomo follower list through Companion.</aside>}{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={loading}>{loading ? "READING VERIFIED HISTORY…" : "ANALYZE TRADER ↗"}</button></form>{profile ? <ProfileCard profile={profile} updated={lastUpdated} onWatch={addToWatchlist} onFollowerEdge={profile.source === "pump" ? () => void loadFollowerEdgeWallet(profile.wallets[0].address, profile.label) : profile.source === "fomo" && profile.handle ? () => void loadFomoFollowerEdge(profile.handle!, profile.label) : undefined} /> : <EmptyState />}</section>
    <FollowerEdgeCard metrics={followerEdge} label={followerEdgeLabel} platform={followerEdgePlatform} loading={followerEdgeLoading} error={followerEdgeError} />
    {pumpDirectory.length > 0 && <section className="panel leaderboard-board" id="pump-directory"><div className="board-head"><div><p className="eyebrow">LIVE PUMP DIRECTORY</p><h2>Test the crowd behind a profile</h2><p>Follower Edge samples public followers and checks active, realized on-chain performance.</p></div><a className="import-link" href="https://pump.fun/profiles" target="_blank" rel="noreferrer">OPEN PUMP ↗</a></div><div className="profile-strip">{pumpDirectory.slice(0, 8).map((item) => <button key={item.wallet} type="button" disabled={followerEdgeLoading} onClick={() => void loadFollowerEdgeWallet(item.wallet, item.label)}><span>#{item.rank}</span><b>@{item.label}</b><small>{shortWallet(item.wallet)}</small><em>FOLLOWER EDGE ↗</em></button>)}</div></section>}
    {leaderboard.length > 0 && <section className="panel leaderboard-board" id="leaderboard"><div className="board-head"><div><p className="eyebrow">YOUR ANALYZED TRADERS</p><h2>Wallet performance</h2><p>Individual realized behavior. Follower Edge remains a separate social signal.</p></div></div><div className="board-controls"><div className="segmented">{(["all", "pump", "fomo"] as Feed[]).map((item) => <button type="button" onClick={() => setFeed(item)} className={feed === item ? "selected" : ""} key={item}>{item.toUpperCase()}</button>)}</div><div className="segmented">{(["7d", "30d", "all"] as ActivityWindow[]).map((item) => <button type="button" onClick={() => setActivityWindow(item)} className={activityWindow === item ? "selected" : ""} key={item}>{item === "all" ? "ALL" : `ACTIVE ${item.toUpperCase()}`}</button>)}</div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>TRADER</th><th>SOURCE</th><th>PERF β</th><th>WIN RATE</th><th>WEIGHTED RETURN</th><th>MEDIAN HOLD</th><th>LAST ACTIVE</th><th /></tr></thead><tbody>{displayedLeaderboard.map((item, index) => <LeaderboardRow key={item.id} profile={item} rank={index + 1} onSelect={() => { setProfile(item); document.querySelector("#manual-analysis")?.scrollIntoView({ behavior: "smooth" }); }} />)}</tbody></table></div></section>}
    {watchlist.length > 0 && <section className="panel watchlist"><div className="panel-head"><div><p className="eyebrow">WATCHLIST</p><h2>Saved signals</h2></div><span className="badge">{watchlist.length}</span></div><div className="watch-items">{watchlist.slice(0, 6).map((item) => <button key={item.id} onClick={() => { setProfile(item); document.querySelector("#manual-analysis")?.scrollIntoView({ behavior: "smooth" }); }}><span>{item.label}</span><b>{item.metrics.score ?? "—"}</b><small>PERFORMANCE BETA</small></button>)}</div></section>}
    {hasExtensionImport && <section className="panel discovery" id="import"><div className="panel-head"><div><p className="eyebrow">EXTENSION HANDOFF</p><h2>Review captured traders</h2></div><span className="badge">USER-TRIGGERED</span></div>{candidateText && <form onSubmit={rankCandidates}><textarea value={candidateText} onChange={(event) => setCandidateText(event.target.value)} aria-label="Imported Pump candidates" /><button className="primary" disabled={discovering}>{discovering ? "ANALYZING…" : "ANALYZE IMPORTED WALLETS"}</button></form>}{discoveryError && <p className="error">{discoveryError}</p>}{rankedCandidates.length > 0 && <p className="success">{rankedCandidates.length} verified wallet{rankedCandidates.length === 1 ? "" : "s"} added.</p>}{fomoCandidates.length > 0 && <div className="fomo-queue"><p className="hint">Choose a Fomo profile to resolve its verified public wallet.</p><div className="ranked-list">{fomoCandidates.map((candidate) => <button type="button" key={candidate} onClick={() => { setSource("fomo"); setSolanaAddress(`@${candidate}`); setHandle(candidate); setLabel(candidate); document.querySelector("#manual-analysis")?.scrollIntoView({ behavior: "smooth" }); }}><span>FOMO</span><b>@{candidate}</b><small>Resolve + analyze</small></button>)}</div></div>}</section>}
    <footer className="site-footer"><span>WHOAPED</span><p>Evidence first. Coverage shown. No guessed identities or invented theses.</p><a href="#explore">Back to top ↑</a></footer>
  </main>;
}

function SignalStep({ index, title, detail }: { index: string; title: string; detail: string }) { return <div className="signal-step"><span>{index}</span><div><b>{title}</b><p>{detail}</p></div></div>; }
function LeaderboardRow({ profile, rank, onSelect }: { profile: AnalysisProfile; rank: number; onSelect: () => void }) { const metrics = profile.metrics; return <tr onClick={onSelect} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onSelect(); }}><td className="rank">{String(rank).padStart(2, "0")}</td><td><b>{profile.label}</b><small>{shortWallet(profile.wallets[0].address)}</small></td><td><span className={`source-pill ${profile.source}`}>{profile.source}</span></td><td><strong className="alpha-number">{metrics.score ?? "—"}</strong></td><td>{percent(metrics.winRate)}</td><td className={(metrics.capitalWeightedReturn ?? 0) >= 0 ? "positive" : "negative"}>{percent(metrics.capitalWeightedReturn)}</td><td>{formatDuration(metrics.medianHoldSeconds)}</td><td><small>{metrics.lastActivityAt ? new Date(metrics.lastActivityAt * 1000).toLocaleDateString() : "No swaps"}</small></td><td><button className="row-open" type="button" onClick={(event) => { event.stopPropagation(); onSelect(); }}>VIEW ↗</button></td></tr>; }
function EmptyState() { return <section className="panel result empty"><p className="eyebrow">WHAT YOU GET</p><h2>A wallet read<br />you can trust.</h2><p>WHOAPED reconstructs realized trades instead of trusting screenshots or headline win rates.</p><div className="legend"><span><b>01</b> realized win rate</span><span><b>02</b> weighted return</span><span><b>03</b> median hold</span><span><b>04</b> follower quality on Pump + Fomo</span></div></section>; }
function ProfileCard({ profile, updated, onWatch, onFollowerEdge }: { profile: AnalysisProfile; updated: string; onWatch: () => void; onFollowerEdge?: () => void }) { const { metrics } = profile; const contradictsPnl = metrics.score !== null && metrics.score >= 45 && ((metrics.realizedPnlUsd ?? 0) < 0 || (metrics.capitalWeightedReturn ?? 0) < 0); return <section className="panel result"><div className="result-top"><div><p className="eyebrow">{profile.source.toUpperCase()} / VERIFIED WALLET</p><h2>{profile.label}</h2><p className="address">{profile.wallets[0].address}</p></div><div className="result-actions"><button className="watch-button" type="button" onClick={onWatch}>+ WATCH</button>{onFollowerEdge && <button className="edge-button" type="button" onClick={onFollowerEdge}>CHECK FOLLOWER EDGE ↗</button>}</div></div><div className="score-row"><div className="score"><span>{metrics.score ?? "—"}</span><small>PERF<br />BETA</small></div><div><p className="score-title">{metrics.score === null ? "Insufficient realized data" : contradictsPnl ? "High win rate, but negative realized performance" : "Individual wallet performance estimate"}</p><p className="muted">A wallet-level summary, separate from the quality of its followers.</p></div></div>{contradictsPnl && <p className="inline-notice">The score and realized result disagree. Loss size and weighted return matter more than headline win rate.</p>}<div className="metrics"><Metric label="WIN RATE" value={percent(metrics.winRate)} /><Metric label="WEIGHTED RETURN" value={percent(metrics.capitalWeightedReturn)} tone={(metrics.capitalWeightedReturn ?? 0) >= 0 ? "positive" : "negative"} /><Metric label="MEDIAN HOLD" value={formatDuration(metrics.medianHoldSeconds)} /><Metric label="REALIZED PNL" value={money(metrics.realizedPnlUsd)} tone={(metrics.realizedPnlUsd ?? 0) >= 0 ? "positive" : "negative"} /></div><div className="activity"><span>REALIZED SAMPLE</span><b>{metrics.closedLots} verified closed FIFO lot{metrics.closedLots === 1 ? "" : "s"}</b><span>{profile.trades.length} parsed swap legs · last activity {metrics.lastActivityAt ? new Date(metrics.lastActivityAt * 1000).toLocaleString() : "unknown"} · analyzed {updated}</span></div>{profile.notices.map((notice) => <p className="inline-notice" key={notice}>{notice}</p>)}</section>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div><span>{label}</span><b className={tone}>{value}</b></div>; }
function FollowerEdgeCard({ metrics, label, platform, loading, error }: { metrics: FollowerEdgeMetrics | null; label: string; platform: "pump" | "fomo"; loading: boolean; error: string }) { if (!loading && !metrics && !error) return null; const collectionRequired = metrics?.status === "collection_required"; return <section className="panel follower-edge-card" id="pump-follower-edge" aria-live="polite" aria-busy={loading}><div className="panel-head"><div><p className="eyebrow">{platform.toUpperCase()} / SOCIAL SIGNAL</p><h2>{label ? `@${label}` : "Follower Edge"}</h2></div><span className="badge">ACTIVE TRADERS / 30D</span></div>{loading && <div className="edge-loading"><b>CALCULATING FOLLOWER EDGE…</b><p>{platform === "pump" ? "Sampling several depths of the public follower list, then checking realized performance." : "Loading the latest explicitly captured Fomo follower snapshot."}</p></div>}{error && <p className="error">{error}</p>}{metrics && <>{collectionRequired ? <div className="edge-loading"><b>COMPANION COLLECTION NEEDED</b><p>Open this profile on Fomo, open its Followers list, then click “Analyze visible followers” in the WHOAPED card.</p></div> : <><div className="edge-primary"><strong>{metrics.followerEdge === null ? "—" : percent(metrics.followerEdge)}</strong><div><span>PROFITABLE ACTIVE FOLLOWERS</span><p>{metrics.profitableFollowers} profitable / {metrics.scorableFollowers} scorable followers</p></div></div><div className="edge-grid"><Metric label="ACTIVE 30D" value={`${metrics.activeFollowers30d} / ${metrics.sampledFollowers}`} /><Metric label="SCORABLE" value={`${metrics.scorableFollowers}`} /><Metric label="MEDIAN WIN RATE" value={percent(metrics.medianFollowerWinRate)} /><Metric label="MEDIAN RETURN" value={percent(metrics.medianFollowerReturn)} tone={(metrics.medianFollowerReturn ?? 0) >= 0 ? "positive" : "negative"} /><Metric label={platform === "pump" ? "PUBLIC SAMPLE" : "VISIBLE SAMPLE"} value={`${metrics.sampledFollowers} / ${metrics.visibleFollowers.toLocaleString()}`} /><Metric label="CONFIDENCE" value={metrics.confidence.toUpperCase()} /></div><p className="edge-method">{platform === "pump" ? "Rank-stratified public Pump sample" : "User-triggered visible Fomo sample"} · {metrics.accessibleFollowers.toLocaleString()} accessible relations · {metrics.metricVersion}</p></>}{metrics.notices.map((notice) => <p className="inline-notice" key={notice}>{notice}</p>)}</>}</section>; }
