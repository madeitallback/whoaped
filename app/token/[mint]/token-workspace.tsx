"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { DesktopShell, WindowPanel } from "@/app/desktop-shell";
import type { TokenSocialActor, TokenThesisEvidence, TokenTradeActivityEvent, TokenWalletActivity } from "@/lib/data/contracts";
import type { PlatformProfileRecord } from "@/lib/platforms/types";
import type { SocialBoardRow } from "@/lib/social-leaderboard";
import type { FomoIdentity, TokenScan } from "@/lib/token-intel/types";
import { mergeTokenHolders, type UnifiedTokenHolder } from "@/lib/token-intel/unified-holders";

const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-5)}`;
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value === null ? "INDEXING" : `${value.toFixed(2)}%`;
const usd = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);

export function TokenWorkspace({ mint }: { mint: string }) {
  const [scan, setScan] = useState<TokenScan | null>(null);
  const [identities, setIdentities] = useState<Record<string, FomoIdentity>>({});
  const [pumpProfiles, setPumpProfiles] = useState<Record<string, PlatformProfileRecord>>({});
  const [persistedActors, setPersistedActors] = useState<TokenSocialActor[]>([]);
  const [theses, setTheses] = useState<TokenThesisEvidence[]>([]);
  const [positions, setPositions] = useState<TokenWalletActivity[]>([]);
  const [events, setEvents] = useState<TokenTradeActivityEvent[]>([]);
  const [performance, setPerformance] = useState<SocialBoardRow[]>([]);
  const [coverage, setCoverage] = useState<"indexed" | "indexing" | "unavailable">("indexing");
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
        setScan(body); setLoading(false);
        const refreshEvidence = async () => {
          const [social, thesis, activity] = await Promise.all([
            fetch(`/api/token/social?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
            fetch(`/api/token/thesis?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
            fetch(`/api/token/activity?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
          ]);
          if (social.ok) setPersistedActors(((await social.json()) as { actors?: TokenSocialActor[] }).actors || []);
          if (thesis.ok) setTheses(((await thesis.json()) as { evidence?: TokenThesisEvidence[] }).evidence || []);
          if (activity.ok) {
            const data = await activity.json() as { positions?: TokenWalletActivity[]; events?: TokenTradeActivityEvent[]; coverage?: "indexed" | "indexing" | "unavailable" };
            setPositions(data.positions || []); setEvents(data.events || []); setCoverage(data.coverage || "indexing");
          }
        };
        const board = fetch("/api/leaderboard/social", { signal: controller.signal }).then(async (r) => r.ok ? (await r.json() as { rows?: SocialBoardRow[] }).rows || [] : []).then(setPerformance).catch(() => undefined);
        await Promise.all([refreshEvidence(), board]);
        const wallets = [...new Set([...body.holders.map((x) => x.owner), ...body.buyers.map((x) => x.owner)])];
        if (!wallets.length) return;
        setEnriching(true);
        const cohort = JSON.stringify({ mint: body.mint, wallets, holderWallets: body.holders.map((x) => x.owner), buyerWallets: body.buyers.map((x) => x.owner) });
        const [fomo, pump] = await Promise.all([
          fetch("/api/token/fomo", { method: "POST", headers: { "content-type": "application/json" }, body: cohort, signal: controller.signal }),
          fetch("/api/token/pump", { method: "POST", headers: { "content-type": "application/json" }, body: cohort, signal: controller.signal }),
        ]);
        if (fomo.ok) setIdentities(((await fomo.json()) as { identities?: Record<string, FomoIdentity> }).identities || {});
        if (pump.ok) setPumpProfiles(((await pump.json()) as { profiles?: Record<string, PlatformProfileRecord> }).profiles || {});
        await refreshEvidence();
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Token scan failed.");
      } finally {
        if (!controller.signal.aborted) { setLoading(false); setEnriching(false); }
      }
    }
    void load();
    return () => controller.abort();
  }, [mint]);

  const positionByWallet = useMemo(() => new Map(positions.map((x) => [x.wallet, x])), [positions]);
  const cohort = useMemo(() => {
    const rows = new Map(positions.map((x) => [x.wallet, x]));
    for (const holder of scan?.holders || []) {
      const old = rows.get(holder.owner);
      rows.set(holder.owner, { wallet: holder.owner, balanceUi: holder.uiAmount, pctOfSupply: holder.pctOfSupply, firstBuyAt: old?.firstBuyAt ?? null, lastBuyAt: old?.lastBuyAt ?? null, lastSellAt: old?.lastSellAt ?? null, buyTxCount: old?.buyTxCount ?? 0, sellTxCount: old?.sellTxCount ?? 0, status: old?.status === "trimmed" ? "trimmed" : "holding", observedAt: scan?.updatedAt || old?.observedAt || new Date(0).toISOString() });
    }
    for (const buyer of scan?.buyers || []) if (!rows.has(buyer.owner)) rows.set(buyer.owner, { wallet: buyer.owner, balanceUi: buyer.uiAmount, pctOfSupply: buyer.pctOfSupply, firstBuyAt: buyer.firstBuyAt, lastBuyAt: buyer.firstBuyAt, lastSellAt: null, buyTxCount: buyer.buyTxCount, sellTxCount: 0, status: buyer.stillHolds ? "holding" : "not_held", observedAt: scan?.updatedAt || new Date(0).toISOString() });
    return [...rows.values()].sort((a, b) => b.balanceUi - a.balanceUi).slice(0, 2000);
  }, [positions, scan]);

  const actors = useMemo(() => {
    const rows = new Map<string, TokenSocialActor>();
    for (const actor of persistedActors) rows.set(`${actor.platform}:${actor.platformProfileId}:${actor.wallet}`, actor);
    if (!scan) return [...rows.values()];
    const buyers = new Set(scan.buyers.map((x) => x.owner));
    const holders = new Set(scan.holders.map((x) => x.owner));
    const relation = (wallet: string) => buyers.has(wallet) && holders.has(wallet) ? "both" as const : buyers.has(wallet) ? "buyer" as const : holders.has(wallet) ? "holder" as const : "observed" as const;
    for (const [wallet, identity] of Object.entries(identities)) {
      const id = identity.identityId || identity.handle; if (!id) continue;
      const key = `fomo:${id}:${wallet}`; if (rows.has(key)) continue;
      rows.set(key, { profileId: `live:${id}`, platform: "fomo", platformProfileId: id, handle: identity.handle, displayName: identity.handle, profileUrl: identity.handle ? `https://fomo.family/profile/${encodeURIComponent(identity.handle)}` : "https://fomo.family/", avatarUrl: identity.avatarUrl ?? null, wallet, relationship: relation(wallet), confidence: "verified", observedAt: scan.updatedAt });
    }
    for (const [wallet, profile] of Object.entries(pumpProfiles)) {
      const key = `pump:${profile.platformProfileId}:${wallet}`; if (rows.has(key)) continue;
      rows.set(key, { profileId: `live:${profile.platformProfileId}`, platform: "pump", platformProfileId: profile.platformProfileId, handle: profile.handle, displayName: profile.displayName, profileUrl: profile.profileUrl, avatarUrl: profile.avatarUrl ?? null, wallet, relationship: relation(wallet), confidence: "verified", observedAt: scan.updatedAt });
    }
    return [...rows.values()];
  }, [identities, persistedActors, pumpProfiles, scan]);

  const holders = useMemo(() => mergeTokenHolders(cohort, actors), [actors, cohort]);
  const evidence = useMemo(() => {
    const actorByWallet = new Map(actors.map((x) => [x.wallet, x]));
    return events.map((event) => { const actor = actorByWallet.get(event.wallet); return { id: `${event.signature}:${event.wallet}:${event.side}`, at: event.occurredAt, kind: event.side === "buy" ? "APED" : "SOLD", actor: actor?.handle ? `@${actor.handle}` : short(event.wallet), platform: actor?.platform, url: `https://solscan.io/tx/${event.signature}` }; }).filter((x) => x.at).sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 20);
  }, [actors, events]);

  const marketCap = scan?.token.priceUsd != null && scan.token.supplyUi != null ? scan.token.priceUsd * scan.token.supplyUi : null;
  return <DesktopShell active="tokens" status={enriching ? "RESOLVING SOCIAL IDENTITIES" : "SOLANA LIVE"}><div className="workspace-stack token-workspace">
    {loading && <WindowPanel title="Scanning token" className="state-window"><p>Reading token metadata, verified Pump activity, current accounts, and social profiles…</p></WindowPanel>}
    {error && <WindowPanel title="Scan error" className="state-window"><p className="error" role="alert">{error}</p><Link className="win-button" href="/">← RETURN TO EXPLORE</Link></WindowPanel>}
    {scan && <>
      <section className="token-identity"><div className="token-mark">{scan.token.image ? <Image src={scan.token.image} alt="" width={62} height={62} sizes="62px" priority /> : scan.token.symbol.slice(0, 1)}</div><div><span className="kicker">TOKEN INTELLIGENCE / {scan.token.isPumpFun ? "PUMP.FUN" : "SOLANA"}</span><h1>{scan.token.name} <small>${scan.token.symbol}</small></h1><p><span>CA</span> {scan.mint}</p></div><div className="token-facts"><span><i className="status-light" />LIVE</span><dl><div><dt>MARKET CAP</dt><dd>{usd(marketCap)}</dd></div><div><dt>LIQUIDITY</dt><dd>{usd(scan.token.liquidityUsd)}</dd></div></dl></div></section>
      <HolderCockpit holders={holders} theses={theses} performance={performance} priceUsd={scan.token.priceUsd} symbol={scan.token.symbol} enriching={enriching} />
      <WindowPanel title="Verified event log" className="event-window" actions={<span className="window-badge">{coverage.toUpperCase()} · {evidence.length} EVENTS</span>}><div className="event-list">{evidence.map((event) => <article key={event.id}><time>{new Date(event.at!).toLocaleString()}</time><span className={`event-kind ${event.kind.toLowerCase()}`}>{event.kind}</span><a href={event.url} target="_blank" rel="noreferrer">{event.actor}</a>{event.platform && <span className={`platform-tag ${event.platform}`}>{event.platform}</span>}</article>)}{!evidence.length && <EmptyState title="Trade event history is indexing." detail="The live holder snapshot remains available while verified Pump transactions are decoded." />}</div></WindowPanel>
      <p className="coverage-note">ⓘ {scan.coverage.note}</p>
      {scan.warnings.length > 0 && <section className="notice">{scan.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
    </>}
  </div></DesktopShell>;
}

function HolderCockpit({ holders, theses, performance, priceUsd, symbol, enriching }: { holders: UnifiedTokenHolder[]; theses: TokenThesisEvidence[]; performance: SocialBoardRow[]; priceUsd: number | null; symbol: string; enriching: boolean }) {
  const [platform, setPlatform] = useState<"all" | "pump" | "fomo">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const counts = useMemo(() => ({ pump: holders.filter((h) => h.profiles.some((p) => p.platform === "pump")).length, fomo: holders.filter((h) => h.profiles.some((p) => p.platform === "fomo")).length }), [holders]);
  const ranking = useMemo(() => ({ byWallet: new Map(performance.filter((r) => r.platform === "pump" && r.wallet).map((r) => [r.wallet!.toLowerCase(), r])), byHandle: new Map(performance.filter((r) => r.platform === "fomo").map((r) => [r.handle.toLowerCase(), r])) }), [performance]);
  const filtered = useMemo(() => holders.filter((holder) => {
    if (platform !== "all" && !holder.profiles.some((p) => p.platform === platform)) return false;
    const needle = query.trim().toLowerCase();
    return !needle || holder.wallet.toLowerCase().includes(needle) || holder.profiles.some((p) => `${p.handle || ""} ${p.displayName || ""}`.toLowerCase().includes(needle));
  }), [holders, platform, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const thesisCounts = useMemo(() => ({ pump: theses.filter((t) => t.platform === "pump").length, fomo: theses.filter((t) => t.platform === "fomo").length }), [theses]);
  const socialCoverage = holders.length ? Math.round((holders.filter((h) => h.profiles.length).length / holders.length) * 100) : 0;
  const updatePlatform = (next: "all" | "pump" | "fomo") => { setPlatform(next); setPage(1); };

  return <section className="token-grid">
    <WindowPanel title="PUMP + FOMO HOLDER MAP" className="holder-window" actions={<span className="window-badge"><i className="status-light" />LIVE</span>}>
      <div className="holder-toolbar"><div className="win-tabs" role="tablist" aria-label="Holder source">{(["all", "pump", "fomo"] as const).map((item) => <button role="tab" aria-selected={platform === item} className={platform === item ? "active" : ""} onClick={() => updatePlatform(item)} key={item}>{item === "all" ? `ALL ${holders.length}` : `${item.toUpperCase()} ${counts[item]}`}</button>)}</div><label className="win-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search profile or wallet" /></label></div>
      <div className="table-wrap"><table className="holder-table"><thead><tr><th>PROFILE / SOURCE</th><th>WALLET</th><th>HOLDING</th><th>SUPPLY</th><th>PERFORMANCE</th><th>THESIS</th></tr></thead><tbody>{visible.map((holder) => <HolderRow holder={holder} key={holder.wallet} priceUsd={priceUsd} symbol={symbol} ranking={ranking} theses={theses} />)}{!enriching && !visible.length && <tr><td colSpan={6}><EmptyState title="No matching holder." detail="Try another source filter or wallet/profile search." /></td></tr>}</tbody></table></div>
      {enriching && <div className="indexing-line">Resolving verified Pump + Fomo identities…</div>}
      <footer className="table-pager"><span>SHOW <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page"><option>10</option><option>25</option><option>50</option></select></span><span>{filtered.length ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} OF ${filtered.length}` : "0 RESULTS"}</span><div><button disabled={safePage === 1} onClick={() => setPage(1)}>«</button><button disabled={safePage === 1} onClick={() => setPage((x) => Math.max(1, x - 1))}>‹</button><b>{safePage} / {pageCount}</b><button disabled={safePage === pageCount} onClick={() => setPage((x) => Math.min(pageCount, x + 1))}>›</button><button disabled={safePage === pageCount} onClick={() => setPage(pageCount)}>»</button></div></footer>
    </WindowPanel>
    <aside className="insight-rail">
      <WindowPanel title="Why they aped" actions={<span className="window-badge">{theses.length} SOURCES</span>}><div className="thesis-stream">{theses.slice(0, 8).map((thesis) => <article key={thesis.id}><header><a href={thesis.profileUrl} target="_blank" rel="noreferrer">{thesis.handle ? `@${thesis.handle}` : thesis.displayName || thesis.platformProfileId}</a><span className={`platform-tag ${thesis.platform}`}>{thesis.platform}</span></header><p>{thesis.sourceText}</p><footer><time>{new Date(thesis.publishedAt || thesis.capturedAt).toLocaleDateString()}</time><a href={thesis.sourceUrl} target="_blank" rel="noreferrer">SOURCE ↗</a></footer></article>)}{!theses.length && <EmptyState title="No public thesis captured." detail="WHOAPED never invents intent from a transaction." />}</div></WindowPanel>
      <WindowPanel title="Signal summary"><dl className="signal-list"><div><dt>SOCIAL COVERAGE</dt><dd>{socialCoverage}%</dd><span style={{ width: `${socialCoverage}%` }} /></div><div><dt>PUMP PROFILES</dt><dd>{counts.pump}</dd><span style={{ width: `${Math.min(100, counts.pump * 5)}%` }} /></div><div><dt>FOMO PROFILES</dt><dd>{counts.fomo}</dd><span style={{ width: `${Math.min(100, counts.fomo * 5)}%` }} /></div><div><dt>PUBLIC THESES</dt><dd>{thesisCounts.pump + thesisCounts.fomo}</dd><span style={{ width: `${Math.min(100, theses.length * 8)}%` }} /></div></dl><p className="signal-footnote">Measured coverage only. Missing data is never scored as zero.</p></WindowPanel>
    </aside>
  </section>;
}

function HolderRow({ holder, priceUsd, symbol, ranking, theses }: { holder: UnifiedTokenHolder; priceUsd: number | null; symbol: string; ranking: { byWallet: Map<string, SocialBoardRow>; byHandle: Map<string, SocialBoardRow> }; theses: TokenThesisEvidence[] }) {
  const result = ranking.byWallet.get(holder.wallet.toLowerCase()) || holder.profiles.map((p) => p.handle ? ranking.byHandle.get(p.handle.toLowerCase()) : undefined).find(Boolean);
  const thesis = theses.find((t) => holder.profiles.some((p) => p.platform === t.platform && (p.platformProfileId === t.platformProfileId || p.handle?.toLowerCase() === t.handle?.toLowerCase())));
  return <tr><td><div className="profile-stack">{holder.profiles.length ? holder.profiles.map((profile) => <a href={profile.profileUrl} target="_blank" rel="noreferrer" className="profile-line" key={`${profile.platform}:${profile.platformProfileId}`}>{profile.avatarUrl ? <Image className="profile-avatar-image" src={profile.avatarUrl} alt="" width={30} height={30} sizes="30px" /> : <span className={`profile-avatar ${profile.platform}`}>{(profile.handle || profile.displayName || "?")[0].toUpperCase()}</span>}<span><b>{profile.handle ? `@${profile.handle}` : profile.displayName || profile.platformProfileId}</b><small className={`platform-tag ${profile.platform}`}>{profile.platform}</small></span></a>) : <span className="unknown-profile"><i>?</i><span><b>Unidentified holder</b><small>ON-CHAIN ONLY</small></span></span>}</div></td><td><a className="wallet-link" href={`https://solscan.io/account/${holder.wallet}`} target="_blank" rel="noreferrer">{short(holder.wallet)} ↗</a></td><td><b>{number(holder.position.balanceUi)} {symbol}</b><small>{usd(priceUsd === null ? null : holder.position.balanceUi * priceUsd)}</small></td><td><b>{percent(holder.position.pctOfSupply)}</b><span className="supply-bar"><i style={{ width: `${Math.min(100, holder.position.pctOfSupply || 0)}%` }} /></span></td><td>{result ? <><b className={(result.pnl24hUsd || 0) >= 0 ? "positive" : "negative"}>{result.pnl24hUsd == null ? result.metricLabel : `${usd(result.pnl24hUsd)} 24H`}</b><small>{result.winRate == null ? result.sampleLabel.toUpperCase() : `${Math.round(result.winRate * 100)}% WIN RATE`}</small></> : <><span className={`position-state ${holder.position.status}`}>{holder.position.status.replace("_", " ").toUpperCase()}</span><small>{holder.position.buyTxCount} BUYS / {holder.position.sellTxCount} SELLS</small></>}</td><td>{thesis ? <a className="thesis-snippet" href={thesis.sourceUrl} target="_blank" rel="noreferrer">“{thesis.sourceText}” ↗</a> : <span className="muted">NO ATTRIBUTABLE THESIS</span>}</td></tr>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><b>{title}</b><p>{detail}</p></div>; }
