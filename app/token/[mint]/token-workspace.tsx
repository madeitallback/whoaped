"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TokenSocialActor, TokenThesisEvidence } from "@/lib/data/contracts";
import type { PlatformProfileRecord } from "@/lib/platforms/types";
import type { FomoIdentity, TokenScan } from "@/lib/token-intel/types";

const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-5)}`;
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value === null ? "INDEXING" : `${value.toFixed(2)}%`;

export function TokenWorkspace({ mint }: { mint: string }) {
  const [scan, setScan] = useState<TokenScan | null>(null);
  const [identities, setIdentities] = useState<Record<string, FomoIdentity>>({});
  const [pumpProfiles, setPumpProfiles] = useState<Record<string, PlatformProfileRecord>>({});
  const [persistedActors, setPersistedActors] = useState<TokenSocialActor[]>([]);
  const [theses, setTheses] = useState<TokenThesisEvidence[]>([]);
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
          const [socialResponse, thesisResponse] = await Promise.all([
            fetch(`/api/token/social?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
            fetch(`/api/token/thesis?mint=${encodeURIComponent(body.mint)}`, { signal: controller.signal }),
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
        };
        await loadPersistedActors();
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
  const fomoHolders = useMemo(() => scan?.holders.filter((holder) => identities[holder.owner]) || [], [scan, identities]);
  const fomoSupply = fomoHolders.reduce((sum, holder) => sum + holder.pctOfSupply, 0);
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
    return [...rows.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }, [identities, persistedActors, pumpProfiles, scan]);
  const timeline = useMemo(() => {
    if (!scan) return [];
    const actorByWallet = new Map(socialActors.map((actor) => [actor.wallet, actor]));
    const events: Array<{ id: string; at: string; kind: "APED" | "THESIS"; actor: string; platform: "pump" | "fomo" | null; detail: string; url: string | null }> = [];
    for (const buyer of scan.buyers) {
      if (!buyer.firstBuyAt) continue;
      const actor = actorByWallet.get(buyer.owner);
      events.push({ id: `buy:${buyer.owner}:${buyer.firstBuyAt}`, at: buyer.firstBuyAt, kind: "APED", actor: actor?.handle ? `@${actor.handle}` : short(buyer.owner), platform: actor?.platform || null, detail: `${buyer.buyTxCount} verified buy${buyer.buyTxCount === 1 ? "" : "s"} · ${buyer.stillHolds ? "still holds" : "no longer visible in top accounts"}`, url: actor?.profileUrl || null });
    }
    for (const thesis of theses) {
      events.push({ id: `thesis:${thesis.id}`, at: thesis.publishedAt || thesis.capturedAt, kind: "THESIS", actor: thesis.handle ? `@${thesis.handle}` : thesis.displayName || thesis.platformProfileId, platform: thesis.platform, detail: thesis.sourceText, url: thesis.sourceUrl });
    }
    return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  }, [scan, socialActors, theses]);
  return <main className="token-page">
    <nav><Link className="brand" href="/">WHOAPED.EXE</Link><div><span className="live-dot" />SOLANA NETWORK <span className="muted">/ TOKEN INTELLIGENCE</span></div></nav>
    {loading && <section className="panel token-loading" aria-live="polite"><div className="panel-head"><h2>Scanning token…</h2><span className="badge">WORKING</span></div><p>Reading token metadata, verified Pump instructions, and current largest accounts.</p></section>}
    {error && <section className="panel token-loading"><div className="panel-head"><h2>Scan failed</h2><span className="badge">ERROR</span></div><p className="error" role="alert">{error}</p><Link href="/">← Return to WHOAPED</Link></section>}
    {scan && <>
      <section className="panel token-header"><div className="panel-head"><div><p className="eyebrow">WHO APED? / {scan.token.isPumpFun ? "PUMP.FUN" : "SOLANA"}</p><h1>{scan.token.name} <small>${scan.token.symbol}</small></h1></div><span className="badge">{scan.coverage.buyerState.toUpperCase()}</span></div><p className="token-ca">{scan.mint}</p><div className="token-status"><span>{scan.token.graduated ? "GRADUATED" : scan.token.graduated === false ? "ON CURVE" : "NON-PUMP"}</span><span>{scan.coverage.scannedSignatures} / {scan.coverage.signatureLimit} recent signatures</span><span>{enriching ? "Resolving Pump + Fomo identities…" : `${Object.keys(pumpProfiles).length} Pump / ${Object.keys(identities).length} Fomo verified`}</span></div></section>
      <section className="token-metrics"><TokenMetric label="RECENT BUYERS" value={number(scan.summary.visibleBuyers)} detail="verified Pump instructions" /><TokenMetric label="STILL HOLDING" value={number(scan.summary.stillHoldingBuyers)} detail="inside visible top accounts" /><TokenMetric label="FOMO SUPPLY" value={percent(enriching ? null : fomoSupply)} detail={enriching ? "resolving visible holders" : `${fomoHolders.length} verified visible holders`} /><TokenMetric label="CURVE PROGRESS" value={percent(scan.token.curveProgressPct)} detail={scan.token.graduated ? "graduated" : "bonding curve"} /></section>
      <p className="coverage-line">ⓘ {scan.coverage.note}</p>
      <section className="panel token-table"><div className="panel-head"><div><p className="eyebrow">PUMP + FOMO / CANONICAL IDENTITIES</p><h2>Social holders</h2></div><span className="badge">{socialActors.length} VERIFIED</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>ACTOR</th><th>SOURCE</th><th>WALLET</th><th>ON-CHAIN ROLE</th><th>CONFIDENCE</th><th>FRESHNESS</th><th /></tr></thead><tbody>{socialActors.map((actor, index) => <tr key={`${actor.platform}:${actor.profileId}:${actor.wallet}`}><td>{index + 1}</td><td><a href={actor.profileUrl} target="_blank" rel="noreferrer">{actor.handle ? `@${actor.handle}` : actor.displayName || actor.platformProfileId}</a></td><td><span className={`source-pill ${actor.platform}`}>{actor.platform}</span></td><td>{short(actor.wallet)}</td><td>{actor.relationship.toUpperCase()}</td><td>{actor.confidence.toUpperCase()}</td><td>{new Date(actor.observedAt).toLocaleString()}</td><td><Link href={`/?wallet=${encodeURIComponent(actor.wallet)}&label=${encodeURIComponent(actor.handle || short(actor.wallet))}`}>WALLET ↗</Link></td></tr>)}{socialActors.length === 0 && <tr className="table-empty"><td colSpan={8}><b>No verified social identity in the measured cohort yet.</b><span>Wallet activity remains visible below. WHOAPED does not guess a Pump/Fomo identity from a display name.</span></td></tr>}</tbody></table></div></section>
      <section className="panel social-timeline"><div className="panel-head"><div><p className="eyebrow">SOCIAL + ON-CHAIN / TIME ORDER</p><h2>What happened?</h2></div><span className="badge">{timeline.length} EVENTS</span></div><div className="timeline-list">{timeline.map((event) => <article key={event.id}><time>{new Date(event.at).toLocaleString()}</time><span className={`timeline-kind ${event.kind.toLowerCase()}`}>{event.kind}</span><div><b>{event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.actor}</a> : event.actor}</b>{event.platform ? <span className={`source-pill ${event.platform}`}>{event.platform}</span> : null}<p>{event.detail}</p></div></article>)}{timeline.length === 0 ? <div className="thesis-empty"><b>No attributable timeline event yet.</b><span>Verified buys and timestamped thesis evidence will appear here as coverage grows.</span></div> : null}</div></section>
      <section className="panel thesis-panel"><div className="panel-head"><div><p className="eyebrow">ATTRIBUTABLE PUBLIC EVIDENCE</p><h2>Why they aped</h2></div><span className="badge">{theses.length} SOURCES / {thesisProvider.toUpperCase()}</span></div><div className="thesis-list">{theses.map((thesis) => <article key={thesis.id}><div><a href={thesis.profileUrl} target="_blank" rel="noreferrer">{thesis.handle ? `@${thesis.handle}` : thesis.displayName || thesis.platformProfileId}</a><span className={`source-pill ${thesis.platform}`}>{thesis.platform}</span><span>{thesis.relevance.toUpperCase()}</span></div><p>{thesis.sourceText}</p><footer><a href={thesis.sourceUrl} target="_blank" rel="noreferrer">OPEN SOURCE ↗</a><span>Published {thesis.publishedAt ? new Date(thesis.publishedAt).toLocaleString() : "time unavailable"} · captured {new Date(thesis.capturedAt).toLocaleString()}</span></footer></article>)}{theses.length === 0 && <div className="thesis-empty"><b>No public thesis captured.</b><span>{thesisProvider === "unavailable" ? "The provider is temporarily unavailable; verified on-chain data remains visible." : "WHOAPED never infers a thesis from a wallet transaction. Evidence appears only with an attributable Pump/Fomo source."}</span></div>}</div></section>
      <section className="panel token-table"><div className="panel-head"><div><p className="eyebrow">VERIFIED ON-CHAIN COHORT</p><h2>Recent apes</h2></div><span className="badge">{scan.buyers.length} BUYERS</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>WALLET</th><th>BUY TXS</th><th>FIRST BUY</th><th>STILL HOLDS</th><th>% SUPPLY</th><th /></tr></thead><tbody>{scan.buyers.map((buyer, index) => <tr key={buyer.owner}><td>{index + 1}</td><td>{short(buyer.owner)}</td><td>{buyer.buyTxCount}</td><td>{buyer.firstBuyAt ? new Date(buyer.firstBuyAt).toLocaleString() : "—"}</td><td>{buyer.stillHolds ? "YES" : "NO / OUTSIDE TOP"}</td><td>{percent(buyer.pctOfSupply)}</td><td><Link href={`/?wallet=${encodeURIComponent(buyer.owner)}&label=${encodeURIComponent(identities[buyer.owner]?.handle || short(buyer.owner))}`}>WALLET ↗</Link></td></tr>)}{scan.buyers.length === 0 && <tr className="table-empty"><td colSpan={7}><b>No verified Pump buys in this fast window.</b><span>This is not a lifetime-zero claim; the resumable historical workers extend coverage asynchronously.</span></td></tr>}</tbody></table></div></section>
      <section className="panel token-table"><div className="panel-head"><div><p className="eyebrow">CURRENT OWNERSHIP</p><h2>Who held?</h2></div><span className="badge">TOP ACCOUNTS</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>OWNER</th><th>LABEL</th><th>TOKENS</th><th>% SUPPLY</th><th /></tr></thead><tbody>{scan.holders.map((holder, index) => <tr key={holder.owner}><td>{index + 1}</td><td>{short(holder.owner)}</td><td>{identities[holder.owner]?.handle ? `FOMO / @${identities[holder.owner].handle}` : holder.label.toUpperCase()}</td><td>{number(holder.uiAmount)}</td><td>{percent(holder.pctOfSupply)}</td><td><Link href={`/?wallet=${encodeURIComponent(holder.owner)}&label=${encodeURIComponent(identities[holder.owner]?.handle || short(holder.owner))}`}>WALLET ↗</Link></td></tr>)}</tbody></table></div></section>
      {scan.warnings.length > 0 && <section className="notice">{scan.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
    </>}
    <footer className="win-taskbar"><span className="win-start">Start</span><span className="task-app">▣ WHOAPED — Token Intel</span><span className="tray">SOLANA ONLINE</span></footer>
  </main>;
}

function TokenMetric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="panel"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
