"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TokenSocialActor, TokenThesisEvidence, TokenTradeActivityEvent, TokenWalletActivity } from "@/lib/data/contracts";
import type { PlatformProfileRecord } from "@/lib/platforms/types";
import type { SocialBoardRow } from "@/lib/social-leaderboard";
import type { FomoIdentity, TokenScan } from "@/lib/token-intel/types";

const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-5)}`;
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value === null ? "INDEXING" : `${value.toFixed(2)}%`;
const usd = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;

export function TokenWorkspace({ mint }: { mint: string }) {
  const [scan, setScan] = useState<TokenScan | null>(null);
  const [identities, setIdentities] = useState<Record<string, FomoIdentity>>({});
  const [pumpProfiles, setPumpProfiles] = useState<Record<string, PlatformProfileRecord>>({});
  const [persistedActors, setPersistedActors] = useState<TokenSocialActor[]>([]);
  const [theses, setTheses] = useState<TokenThesisEvidence[]>([]);
  const [activityPositions, setActivityPositions] = useState<TokenWalletActivity[]>([]);
  const [activityEvents, setActivityEvents] = useState<TokenTradeActivityEvent[]>([]);
  const [socialPerformance, setSocialPerformance] = useState<SocialBoardRow[]>([]);
  const [activityCoverage, setActivityCoverage] = useState<"indexed" | "indexing" | "unavailable">("indexing");
  const [thesisProvider, setThesisProvider] = useState<"cached" | "refreshed" | "not_configured" | "unavailable">("unavailable");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch("/api/token/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: mint }), signal: controller.signal });
        const body = await response.json() as TokenScan & { error?: string };
        if (!response.ok) throw new Error(body.error || "Token scan failed.");
        setScan(body);
        setLoading(false);
        const loadPersistedActors = async () => {
          const [socialResponse, thesisResponse, activityResponse] = await Promise.all([
            fetch(`/api/token/social?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
            fetch(`/api/token/thesis?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
            fetch(`/api/token/activity?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
          ]);
          if (socialResponse.ok) {
            const socialBody = await socialResponse.json() as { actors?: TokenSocialActor[] };
            setPersistedActors(socialBody.actors || []);
          }
          if (thesisResponse.ok) {
            const thesisBody = await thesisResponse.json() as { evidence?: TokenThesisEvidence[]; provider?: "cached" | "refreshed" | "not_configured" | "unavailable" };
            setTheses(thesisBody.evidence || []);
            setThesisProvider(thesisBody.provider || "unavailable");
          }
          if (activityResponse.ok) {
            const activityBody = await activityResponse.json() as { positions?: TokenWalletActivity[]; events?: TokenTradeActivityEvent[]; coverage?: "indexed" | "indexing" | "unavailable" };
            setActivityPositions(activityBody.positions || []);
            setActivityEvents(activityBody.events || []);
            setActivityCoverage(activityBody.coverage || "indexing");
          }
        };
        const loadSocialPerformance = async () => {
          const leaderboardResponse = await fetch("/api/leaderboard/social", { signal: controller.signal });
          if (!leaderboardResponse.ok) return;
          const leaderboardBody = await leaderboardResponse.json() as { rows?: SocialBoardRow[] };
          setSocialPerformance(leaderboardBody.rows || []);
        };
        await Promise.all([loadPersistedActors(), loadSocialPerformance().catch(() => undefined)]);
        const wallets = [...new Set([...body.holders.map((item) => item.owner), ...body.buyers.map((item) => item.owner)])];
        if (!wallets.length) return;
        setEnriching(true);
        const cohortBody = JSON.stringify({ mint: body.mint, wallets, holderWallets: body.holders.map((item) => item.owner), buyerWallets: body.buyers.map((item) => item.owner) });
        const [fomoResponse, pumpResponse] = await Promise.all([
          fetch("/api/token/fomo", { method: "POST", headers: { "content-type": "application/json" }, body: cohortBody, signal: controller.signal }),
          fetch("/api/token/pump", { method: "POST", headers: { "content-type": "application/json" }, body: cohortBody, signal: controller.signal }),
        ]);
        if (fomoResponse.ok) {
          const identityBody = await fomoResponse.json() as { identities?: Record<string, FomoIdentity> };
          setIdentities(identityBody.identities || {});
        }
        if (pumpResponse.ok) {
          const pumpBody = await pumpResponse.json() as { profiles?: Record<string, PlatformProfileRecord> };
          setPumpProfiles(pumpBody.profiles || {});
        }
        await loadPersistedActors();
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Token scan failed.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setEnriching(false);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [mint]);
  const activityByWallet = useMemo(() => new Map(activityPositions.map((position) => [position.wallet, position])), [activityPositions]);
  const cohortRows = useMemo(() => {
    const rows = new Map(activityPositions.map((position) => [position.wallet, position]));
    for (const buyer of scan?.buyers || []) {
      if (rows.has(buyer.owner)) continue;
      rows.set(buyer.owner, { wallet: buyer.owner, balanceUi: buyer.uiAmount, pctOfSupply: buyer.pctOfSupply, firstBuyAt: buyer.firstBuyAt, lastBuyAt: buyer.firstBuyAt, lastSellAt: null, buyTxCount: buyer.buyTxCount, sellTxCount: 0, status: buyer.stillHolds ? "holding" : "not_held", observedAt: scan?.updatedAt || new Date(0).toISOString() });
    }
    return [...rows.values()].sort((left, right) => right.buyTxCount - left.buyTxCount || right.sellTxCount - left.sellTxCount).slice(0, 500);
  }, [activityPositions, scan]);
  const socialActors = useMemo(() => {
    const rows = new Map<string, TokenSocialActor>();
    for (const actor of persistedActors) rows.set(`${actor.platform}:${actor.platformProfileId}:${actor.wallet}`, actor);
    if (scan) {
      const buyers = new Set(scan.buyers.map((buyer) => buyer.owner));
      const holders = new Set(scan.holders.map((holder) => holder.owner));
      for (const [wallet, identity] of Object.entries(identities)) {
        const platformProfileId = identity.identityId || identity.handle;
        if (!platformProfileId) continue;
        const relationship = buyers.has(wallet) && holders.has(wallet) ? "both" : buyers.has(wallet) ? "buyer" : holders.has(wallet) ? "holder" : "observed";
        const key = `fomo:${platformProfileId}:${wallet}`;
        if (rows.has(key)) continue;
        rows.set(key, {
          profileId: `live:${platformProfileId}`,
          platform: "fomo",
          platformProfileId,
          handle: identity.handle,
          displayName: identity.handle,
          profileUrl: identity.handle ? `https://fomo.family/profile/${encodeURIComponent(identity.handle)}` : "https://fomo.family/",
          wallet,
          relationship,
          confidence: "verified",
          observedAt: scan.updatedAt,
        });
      }
      for (const [wallet, profile] of Object.entries(pumpProfiles)) {
        const relationship = buyers.has(wallet) && holders.has(wallet) ? "both" : buyers.has(wallet) ? "buyer" : holders.has(wallet) ? "holder" : "observed";
        const key = `pump:${profile.platformProfileId}:${wallet}`;
        if (rows.has(key)) continue;
        rows.set(key, {
          profileId: `live:${profile.platformProfileId}`,
          platform: "pump",
          platformProfileId: profile.platformProfileId,
          handle: profile.handle,
          displayName: profile.displayName,
          profileUrl: profile.profileUrl,
          wallet,
          relationship,
          confidence: "verified",
          observedAt: scan.updatedAt,
        });
      }
    }
    const priority = { holding: 0, trimmed: 1, exited: 2, not_held: 3 } as const;
    return [...rows.values()].sort((a, b) => {
      const aPosition = activityByWallet.get(a.wallet)?.status || (a.relationship === "holder" || a.relationship === "both" ? "holding" : "not_held");
      const bPosition = activityByWallet.get(b.wallet)?.status || (b.relationship === "holder" || b.relationship === "both" ? "holding" : "not_held");
      return priority[aPosition] - priority[bPosition] || b.observedAt.localeCompare(a.observedAt);
    });
  }, [activityByWallet, identities, persistedActors, pumpProfiles, scan]);
  const socialHolderCount = useMemo(() => socialActors.filter((actor) => {
    const status = activityByWallet.get(actor.wallet)?.status;
    return status === "holding" || status === "trimmed" || (!status && (actor.relationship === "holder" || actor.relationship === "both"));
  }).length, [activityByWallet, socialActors]);
  const positionSummary = useMemo(() => ({
    current: cohortRows.filter((row) => row.status === "holding" || row.status === "trimmed").length,
    exited: cohortRows.filter((row) => row.status === "exited").length,
    unproven: cohortRows.filter((row) => row.status === "not_held").length,
  }), [cohortRows]);
  const timeline = useMemo(() => {
    if (!scan) return [];
    const actorByWallet = new Map(socialActors.map((actor) => [actor.wallet, actor]));
    const events: Array<{ id: string; at: string; kind: "APED" | "SOLD" | "THESIS"; actor: string; platform: "pump" | "fomo" | null; detail: string; url: string | null }> = [];
    const indexedBuys = new Set<string>();
    for (const trade of activityEvents) {
      if (!trade.occurredAt) continue;
      const actor = actorByWallet.get(trade.wallet);
      const position = activityByWallet.get(trade.wallet);
      if (trade.side === "buy") indexedBuys.add(trade.wallet);
      events.push({ id: `trade:${trade.signature}:${trade.wallet}:${trade.side}`, at: trade.occurredAt, kind: trade.side === "buy" ? "APED" : "SOLD", actor: actor?.handle ? `@${actor.handle}` : short(trade.wallet), platform: actor?.platform || null, detail: `${trade.venue === "curve" ? "Pump curve" : "PumpSwap"} verified ${trade.side} · position ${position?.status.replace("_", " ") || "indexing"}`, url: `https://solscan.io/tx/${encodeURIComponent(trade.signature)}` });
    }
    for (const buyer of scan.buyers) {
      if (!buyer.firstBuyAt || indexedBuys.has(buyer.owner)) continue;
      const actor = actorByWallet.get(buyer.owner);
      events.push({ id: `buy:${buyer.owner}:${buyer.firstBuyAt}`, at: buyer.firstBuyAt, kind: "APED", actor: actor?.handle ? `@${actor.handle}` : short(buyer.owner), platform: actor?.platform || null, detail: `${buyer.buyTxCount} verified buy${buyer.buyTxCount === 1 ? "" : "s"} · ${buyer.stillHolds ? "still holds" : "no longer visible in top accounts"}`, url: actor?.profileUrl || null });
    }
    for (const thesis of theses) {
      events.push({ id: `thesis:${thesis.id}`, at: thesis.publishedAt || thesis.capturedAt, kind: "THESIS", actor: thesis.handle ? `@${thesis.handle}` : thesis.displayName || thesis.platformProfileId, platform: thesis.platform, detail: thesis.sourceText, url: thesis.sourceUrl });
    }
    return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  }, [activityByWallet, activityEvents, scan, socialActors, theses]);
  return <main className="token-page">
    <nav className="top-nav"><Link className="brand" href="/">WHOAPED</Link><div className="nav-links"><a href="#social-actors">Social actors</a><a href="#positions">Positions</a><a href="#theses">Theses</a><a href="#timeline">Timeline</a></div><span className="network-state"><i className="live-dot" />SOLANA LIVE</span></nav>
    {loading && <section className="panel token-loading" aria-live="polite"><div className="panel-head"><h2>Scanning token…</h2><span className="badge">WORKING</span></div><p>Reading token metadata, verified Pump instructions, and current largest accounts.</p></section>}
    {error && <section className="panel token-loading"><div className="panel-head"><h2>Scan failed</h2><span className="badge">ERROR</span></div><p className="error" role="alert">{error}</p><Link href="/">← Return to WHOAPED</Link></section>}
    {scan && <>
      <section className="panel token-header"><div className="panel-head"><div><p className="eyebrow">TOKEN SOCIAL INTELLIGENCE / {scan.token.isPumpFun ? "PUMP.FUN" : "SOLANA"}</p><h1>{scan.token.name} <small>${scan.token.symbol}</small></h1></div><span className="badge">{scan.coverage.buyerState.toUpperCase()}</span></div><p className="token-ca">{scan.mint}</p><p className="token-readout"><b>{socialActors.length} verified social actor{socialActors.length === 1 ? "" : "s"}</b> across Pump and Fomo. <b>{socialHolderCount} are visible current holders</b>, the indexed wallet cohort contains {positionSummary.exited} verified exits, and {theses.length} attributable public {theses.length === 1 ? "thesis" : "theses"}.</p><div className="token-status"><span>{scan.token.graduated ? "GRADUATED" : scan.token.graduated === false ? "ON CURVE" : "NON-PUMP"}</span><span>{scan.coverage.scannedSignatures} / {scan.coverage.signatureLimit} recent signatures</span><span>{enriching ? "Resolving Pump + Fomo identities…" : `${Object.keys(pumpProfiles).length} Pump / ${Object.keys(identities).length} Fomo verified`}</span></div></section>
      <section className="token-metrics"><TokenMetric label="SOCIAL ACTORS" value={enriching ? "…" : number(socialActors.length)} detail="verified Pump + Fomo identities" /><TokenMetric label="SOCIAL HOLDERS" value={enriching ? "…" : number(socialHolderCount)} detail="visible in current token accounts" /><TokenMetric label="VERIFIED EXITS" value={number(positionSummary.exited)} detail={`${positionSummary.unproven} cohort exits remain unproven`} /><TokenMetric label="PUBLIC THESES" value={number(theses.length)} detail={thesisProvider === "refreshed" ? "live provider refresh" : thesisProvider} /></section>
      <p className="coverage-line">ⓘ {scan.coverage.note}</p>
      <TokenSocialCockpit actors={socialActors} theses={theses} positions={activityByWallet} performance={socialPerformance} enriching={enriching} />
      <section className="panel token-table" id="social-actors"><div className="panel-head"><div><p className="eyebrow">PUMP + FOMO / VERIFIED IDENTITIES</p><h2>Who aped—and are they still in?</h2></div><span className="badge">{socialActors.length} VERIFIED</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>ACTOR</th><th>SOURCE</th><th>POSITION</th><th>WALLET</th><th>ROLE</th><th>CONFIDENCE</th><th /></tr></thead><tbody>{socialActors.map((actor, index) => { const indexedStatus = activityByWallet.get(actor.wallet)?.status; const status = indexedStatus || (actor.relationship === "holder" || actor.relationship === "both" ? "holding" : "not_held"); return <tr key={`${actor.platform}:${actor.profileId}:${actor.wallet}`}><td>{index + 1}</td><td><a href={actor.profileUrl} target="_blank" rel="noreferrer">{actor.handle ? `@${actor.handle}` : actor.displayName || actor.platformProfileId}</a></td><td><span className={`source-pill ${actor.platform}`}>{actor.platform}</span></td><td><span className={`position-state ${status}`}>{status.replace("_", " ").toUpperCase()}</span></td><td>{short(actor.wallet)}</td><td>{actor.relationship.toUpperCase()}</td><td>{actor.confidence.toUpperCase()}</td><td><Link href={`/?wallet=${encodeURIComponent(actor.wallet)}&label=${encodeURIComponent(actor.handle || short(actor.wallet))}`}>ANALYZE ↗</Link></td></tr>; })}{socialActors.length === 0 && <tr className="table-empty"><td colSpan={8}><b>No verified social identity in the measured cohort yet.</b><span>Wallet activity remains visible below. WHOAPED never guesses an identity from a display name.</span></td></tr>}</tbody></table></div></section>
      <section className="panel token-table" id="positions"><div className="panel-head"><div><p className="eyebrow">VERIFIED ON-CHAIN COHORT</p><h2>Position reconciliation</h2></div><span className="badge">{activityCoverage.toUpperCase()} / {cohortRows.length} WALLETS</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>WALLET</th><th>BUYS</th><th>SELLS</th><th>FIRST BUY</th><th>LAST SELL</th><th>POSITION</th><th>% SUPPLY</th><th /></tr></thead><tbody>{cohortRows.map((position, index) => <tr key={position.wallet}><td>{index + 1}</td><td>{short(position.wallet)}</td><td>{position.buyTxCount}</td><td>{position.sellTxCount}</td><td>{position.firstBuyAt ? new Date(position.firstBuyAt).toLocaleString() : "—"}</td><td>{position.lastSellAt ? new Date(position.lastSellAt).toLocaleString() : "—"}</td><td><span className={`position-state ${position.status}`}>{position.status.replace("_", " ").toUpperCase()}</span></td><td>{percent(position.pctOfSupply)}</td><td><Link href={`/?wallet=${encodeURIComponent(position.wallet)}&label=${encodeURIComponent(identities[position.wallet]?.handle || short(position.wallet))}`}>ANALYZE ↗</Link></td></tr>)}{cohortRows.length === 0 && <tr className="table-empty"><td colSpan={9}><b>Trade history is indexing.</b><span>The live scan remains visible while resumable workers decode Pump curve and PumpSwap buys and sells.</span></td></tr>}</tbody></table></div></section>
      <section className="panel thesis-panel" id="theses"><div className="panel-head"><div><p className="eyebrow">ATTRIBUTABLE PUBLIC EVIDENCE</p><h2>Why they aped</h2></div><span className="badge">{theses.length} SOURCES / {thesisProvider.toUpperCase()}</span></div><div className="thesis-list">{theses.map((thesis) => <article key={thesis.id}><div><a href={thesis.profileUrl} target="_blank" rel="noreferrer">{thesis.handle ? `@${thesis.handle}` : thesis.displayName || thesis.platformProfileId}</a><span className={`source-pill ${thesis.platform}`}>{thesis.platform}</span><span>{thesis.relevance.toUpperCase()}</span></div><p>{thesis.sourceText}</p><footer><a href={thesis.sourceUrl} target="_blank" rel="noreferrer">OPEN SOURCE ↗</a><span>Published {thesis.publishedAt ? new Date(thesis.publishedAt).toLocaleString() : "time unavailable"} · captured {new Date(thesis.capturedAt).toLocaleString()}</span></footer></article>)}{theses.length === 0 && <div className="thesis-empty"><b>No public thesis captured.</b><span>{thesisProvider === "unavailable" ? "The provider is temporarily unavailable; verified on-chain data remains visible." : "WHOAPED never infers a thesis from a transaction. Evidence appears only with an attributable Pump/Fomo source."}</span></div>}</div></section>
      <section className="panel social-timeline" id="timeline"><div className="panel-head"><div><p className="eyebrow">SOCIAL + ON-CHAIN / TIME ORDER</p><h2>The full story</h2></div><span className="badge">{timeline.length} EVENTS</span></div><div className="timeline-list">{timeline.map((event) => <article key={event.id}><time>{new Date(event.at).toLocaleString()}</time><span className={`timeline-kind ${event.kind.toLowerCase()}`}>{event.kind}</span><div><b>{event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.actor}</a> : event.actor}</b>{event.platform ? <span className={`source-pill ${event.platform}`}>{event.platform}</span> : null}<p>{event.detail}</p></div></article>)}{timeline.length === 0 ? <div className="thesis-empty"><b>No attributable timeline event yet.</b><span>Verified buys, sells, and timestamped thesis evidence will appear here as coverage grows.</span></div> : null}</div></section>
      <section className="panel token-table"><div className="panel-head"><div><p className="eyebrow">CURRENT OWNERSHIP</p><h2>Who held?</h2></div><span className="badge">TOP ACCOUNTS</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>OWNER</th><th>LABEL</th><th>TOKENS</th><th>% SUPPLY</th><th /></tr></thead><tbody>{scan.holders.map((holder, index) => <tr key={holder.owner}><td>{index + 1}</td><td>{short(holder.owner)}</td><td>{identities[holder.owner]?.handle ? `FOMO / @${identities[holder.owner].handle}` : holder.label.toUpperCase()}</td><td>{number(holder.uiAmount)}</td><td>{percent(holder.pctOfSupply)}</td><td><Link href={`/?wallet=${encodeURIComponent(holder.owner)}&label=${encodeURIComponent(identities[holder.owner]?.handle || short(holder.owner))}`}>WALLET ↗</Link></td></tr>)}</tbody></table></div></section>
      {scan.warnings.length > 0 && <section className="notice">{scan.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
    </>}
    <footer className="site-footer"><span>WHOAPED</span><p>Verified identities, positions, and public evidence—coverage always visible.</p><Link href="/">Explore another token</Link></footer>
  </main>;
}

function TokenMetric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="panel"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }

function TokenSocialCockpit({ actors, theses, positions, performance, enriching }: { actors: TokenSocialActor[]; theses: TokenThesisEvidence[]; positions: Map<string, TokenWalletActivity>; performance: SocialBoardRow[]; enriching: boolean }) {
  const [platform, setPlatform] = useState<"all" | "pump" | "fomo">("all");
  const [thesisPlatform, setThesisPlatform] = useState<"all" | "pump" | "fomo">("all");
  const visible = actors.filter((actor) => platform === "all" || actor.platform === platform);
  const visibleTheses = theses.filter((thesis) => thesisPlatform === "all" || thesis.platform === thesisPlatform);
  const thesesByProfile = new Map<string, TokenThesisEvidence[]>();
  for (const thesis of theses) thesesByProfile.set(thesis.profileId, [...(thesesByProfile.get(thesis.profileId) || []), thesis]);
  const counts = { pump: actors.filter((actor) => actor.platform === "pump").length, fomo: actors.filter((actor) => actor.platform === "fomo").length };
  const thesisCounts = { pump: theses.filter((thesis) => thesis.platform === "pump").length, fomo: theses.filter((thesis) => thesis.platform === "fomo").length };
  const performanceByWallet = new Map(performance.filter((row) => row.platform === "pump" && row.wallet).map((row) => [row.wallet!.toLowerCase(), row]));
  const performanceByHandle = new Map(performance.filter((row) => row.platform === "fomo").map((row) => [row.handle.toLowerCase(), row]));
  return <section className="token-cockpit">
    <div className="terminal-panel actor-matrix"><header className="section-head"><div><span className="kicker">CROSS-PLATFORM HOLDER MAP</span><h2>Who aped—and who still holds?</h2><p>Verified identities, position truth, and daily performance in one row.</p></div><div className="source-health"><span><i className="dot pump" />{counts.pump} PUMP</span><span><i className="dot fomo" />{counts.fomo} FOMO</span></div></header><div className="terminal-tabs cockpit-tabs">{(["all", "pump", "fomo"] as const).map((item) => <button type="button" className={platform === item ? "active" : ""} onClick={() => setPlatform(item)} key={item}>{item === "all" ? `ALL ${actors.length}` : `${item.toUpperCase()} ${counts[item]}`}</button>)}</div><div className="actor-list">{visible.map((actor) => { const position = positions.get(actor.wallet); const status = position?.status || (actor.relationship === "holder" || actor.relationship === "both" ? "holding" : "not_held"); const actorTheses = thesesByProfile.get(actor.profileId) || []; const ranked = actor.platform === "pump" ? performanceByWallet.get(actor.wallet.toLowerCase()) : actor.handle ? performanceByHandle.get(actor.handle.toLowerCase()) : undefined; return <article className="actor-card" key={`${actor.platform}:${actor.profileId}:${actor.wallet}`}><span className={`avatar-fallback ${actor.platform}`}>{(actor.handle || actor.displayName || "?").slice(0, 1).toUpperCase()}</span><div className="actor-identity"><a href={actor.profileUrl} target="_blank" rel="noreferrer">{actor.handle ? `@${actor.handle}` : actor.displayName || actor.platformProfileId}</a><span>{short(actor.wallet)} · {actor.relationship.replace("_", " ")}</span></div><em className={`platform-tag ${actor.platform}`}>{actor.platform}</em><span className={`position-state ${status}`}>{status.replace("_", " ").toUpperCase()}</span><div className="actor-proof"><b>{ranked ? actor.platform === "fomo" ? `${usd(ranked.pnl24hUsd)} / 24h` : `${ranked.primaryMetric ?? "—"} score · ${pct(ranked.winRate)}` : position ? `${position.buyTxCount} buys / ${position.sellTxCount} sells` : "Position indexing"}</b><small>{ranked ? actor.platform === "pump" ? `${ranked.sampleLabel} · ${ranked.sampleConfidence === null ? "unknown confidence" : `${Math.round(ranked.sampleConfidence * 100)}% confidence`}` : `${ranked.trades24h ?? 0} Fomo trades · daily rank #${ranked.platformRank}` : actorTheses.length ? `${actorTheses.length} public thesis source${actorTheses.length === 1 ? "" : "s"}` : "Not on today's ranked board"}</small></div><a className="open-arrow" href={actor.profileUrl} target="_blank" rel="noreferrer">↗</a></article>; })}{!enriching && visible.length === 0 ? <div className="cockpit-empty"><b>No verified {platform === "all" ? "social" : platform} identity in this measured cohort.</b><p>Wallet activity remains available below; WHOAPED never guesses who owns a wallet.</p></div> : null}{enriching ? <div className="cockpit-empty"><b>Resolving Pump + Fomo identities…</b></div> : null}</div></div>
    <aside className="terminal-panel thesis-feed"><header className="section-head"><div><span className="kicker">LIVE THESIS FEED</span><h2>Why they aped</h2></div><div className="source-health"><span><i className="dot pump" />{thesisCounts.pump}</span><span><i className="dot fomo" />{thesisCounts.fomo}</span></div></header><div className="terminal-tabs cockpit-tabs">{(["all", "pump", "fomo"] as const).map((item) => <button type="button" className={thesisPlatform === item ? "active" : ""} onClick={() => setThesisPlatform(item)} key={item}>{item === "all" ? `ALL ${theses.length}` : `${item.toUpperCase()} ${thesisCounts[item]}`}</button>)}</div><div className="thesis-stream">{visibleTheses.slice(0, 12).map((thesis) => <article key={thesis.id}><div><a href={thesis.profileUrl} target="_blank" rel="noreferrer">{thesis.handle ? `@${thesis.handle}` : thesis.displayName || thesis.platformProfileId}</a><em className={`platform-tag ${thesis.platform}`}>{thesis.platform}</em></div><p>{thesis.sourceText}</p><footer><time>{new Date(thesis.publishedAt || thesis.capturedAt).toLocaleString()}</time><a href={thesis.sourceUrl} target="_blank" rel="noreferrer">SOURCE ↗</a></footer></article>)}{visibleTheses.length === 0 ? <div className="cockpit-empty"><b>No attributable {thesisPlatform === "all" ? "public" : thesisPlatform} thesis found.</b><p>FomoScan is the automated thesis provider today. Pump evidence appears only when an attributable public source is captured; a buy is never presented as intent.</p></div> : null}</div></aside>
  </section>;
}
