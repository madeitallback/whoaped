"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Buyer, ScanResponse, SupplySnapshot } from "@/lib/types";

type Candidate = { mint: string; name: string; symbol: string; image: string | null; mc: number | null };
type ApiError = { ok: false; code: string; error: string; candidates?: Candidate[] };

const short = (address: string) => `${address.slice(0, 5)}…${address.slice(-4)}`;
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: value < 100 ? 2 : 0 }).format(value);
const pct = (value: number) => `${number(value)}%`;
const time = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "completion transaction indexed";

export default function Home() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"holders" | "buyers">("holders");
  const [filter, setFilter] = useState("all");
  const [chart, setChart] = useState<SupplySnapshot[]>([]);

  async function scan(value = input) {
    setLoading(true); setError(null); setCandidates([]);
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: value }) });
      const body = await response.json() as ScanResponse | ApiError;
      if (!body.ok) { setError(body.error); setCandidates(body.candidates || []); setData(null); return; }
      setData(body); setInput(body.mint); setFilter("all");
    } catch { setError("The scan service is unavailable. Check your connection and try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!data || !data.warnings.some(note => /indexing/i.test(note))) return;
    const timer = window.setInterval(() => {
      void fetch("/api/index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint: data.mint }) })
        .then(response => response.json())
        .then((state: { ok?: boolean; dune?: string; helius?: string }) => {
          if (state.ok && state.dune !== "running" && state.dune !== "queued" && state.helius === "completed") void scan(data.mint);
        })
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [data]);
  useEffect(() => {
    if (!data) { setChart([]); return; }
    void fetch(`/api/chart?mint=${encodeURIComponent(data.mint)}`)
      .then(response => response.ok ? response.json() as Promise<{ ok: true; points: SupplySnapshot[] }> : null)
      .then(body => setChart(body?.points || []))
      .catch(() => setChart([]));
  }, [data?.mint]);
  function submit(event: FormEvent) { event.preventDefault(); void scan(); }
  function copy(value: string) { navigator.clipboard?.writeText(value); }
  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === "holders") return data.holders.filter(x => filter === "all" || x.label === filter || (filter === "other" && x.label === "unknown"));
    return data.pumpfunBuyers.wallets.filter(x => filter === "all" || x.bucket === filter || x.phase === filter || (filter === "holding" && x.stillHolds));
  }, [data, tab, filter]);

  return <main>
    <header className="nav"><a className="brand" href="/">WHO<span>APED</span>?</a><div className="status"><i /> Solana mainnet</div></header>
    <section className="intro">
      <p className="eyebrow">WALLET INTELLIGENCE / SOLANA</p>
      <h1>Who bought this coin?</h1>
      <p className="lede">Split unique buyers into <b>verified FOMO</b>, <b>Pump.fun</b>, and <b>other unknown wallets</b>. Data coverage is shown on every scan.</p>
      <form onSubmit={submit} className="search"><span>⌕</span><input value={input} onChange={e => setInput(e.target.value)} placeholder="Paste a mint, Pump.fun URL, or search $TICKER" aria-label="Token mint or ticker" /><button disabled={loading}>{loading ? "SCANNING…" : "SCAN"}</button></form>
      <p className="hint">Works with Pump.fun coins and any SPL token. Current holder coverage starts with the largest 20 accounts while the full index is built.</p>
    </section>
    {error && <section className="notice error"><b>{error}</b>{candidates.length > 0 && <div className="candidates">{candidates.map(c => <button key={c.mint} onClick={() => void scan(c.mint)}><span>{c.image ? <img src={c.image} alt="" /> : "◎"}</span><b>{c.symbol}</b><small>{c.name} · {short(c.mint)}</small></button>)}</div>}</section>}
    {loading && <section className="loading"><div className="scanline" /><span>Reading mint metadata</span><span>Resolving top holders</span><span>Matching verified FOMO labels</span><span>Parsing curve buys</span></section>}
    {data && <>
      <section className="token-head">
        <TokenIcon image={data.token.image} symbol={data.token.symbol} /><div><p className="eyebrow">{data.token.isPumpFun ? "PUMP.FUN TOKEN" : "SPL TOKEN"}</p><h2>{data.token.name} <em>${data.token.symbol}</em></h2><button className="address" onClick={() => copy(data.mint)}>{short(data.mint)} <span>⧉</span></button></div>
        <div className={`badge ${data.token.graduated ? "green" : "orange"}`}>{data.token.graduated === null ? "NOT PUMP" : data.token.graduated ? "GRADUATED" : "ON CURVE"}</div>
      </section>
      <section className="hero-grid">
        <MixCard label="FOMO" tone="pink" data={data.mix.fomo} detail="Verified FOMO wallets" />
        <MixCard label="PUMP.FUN" tone="yellow" data={data.mix.pumpfun} detail="Curve buy wallets" />
        <MixCard label="OTHER" tone="blue" data={data.mix.other} detail="Unknown / unlabelled wallets" />
      </section>
      <p className="coverage">ⓘ {data.split.coverageNote}</p>
      {data.token.isPumpFun && <p className="coverage">⌁ Curve index: {data.indexing.curve.state === "completed" ? `complete · ${number(data.indexing.curve.buyersFound)} buyers found` : `${data.indexing.curve.state} · ${number(data.indexing.curve.scannedSignatures)} signatures scanned · ${number(data.indexing.curve.buyersFound)} buyers found`}</p>}
      <p className="coverage">⌁ Holder index: {data.indexing.holders.state === "completed" ? `complete · ${number(data.indexing.holders.holderCount)} owners` : `${data.indexing.holders.state} · fast top-account view shown`}</p>
      <p className="coverage">⌁ FOMO labels: {data.indexing.labels.state === "completed" ? `complete · ${number(data.indexing.labels.matched)} verified mappings` : `${data.indexing.labels.state} · ${number(data.indexing.labels.checked)} wallets checked`}</p>
      <section className="context-grid">
        <Metric title="Curve leftover" value={data.split.pumpfunCurvePctOfSupply === null ? "N/A" : pct(data.split.pumpfunCurvePctOfSupply)} sub={data.lifecycle.graduation ? `Graduated ${time(data.lifecycle.graduation.at)} · ${short(data.lifecycle.graduation.buyer)}` : data.token.curveProgressPct !== null ? `${pct(data.token.curveProgressPct)} to graduation` : "Not a Pump.fun curve"} accent="yellow" />
        <Metric title="PumpSwap buyers" value={data.venues.pumpswapBuyers === null ? "INDEXING" : number(data.venues.pumpswapBuyers)} sub={data.token.graduated ? "Post-graduation wallets" : "N/A while on curve"} />
        <Metric title="New after grad" value={data.venues.newAfterGrad === null ? "—" : number(data.venues.newAfterGrad)} sub="PumpSwap-only wallets" />
        <Metric title="Creator balance" value={pct(data.split.creatorPctOfSupply)} sub={data.addresses.creator ? short(data.addresses.creator) : "Not detected"} accent="pink" />
      </section>
      <SupplyChart points={chart} />
      <section className="section-head"><div><p className="eyebrow">ADDRESS INTELLIGENCE</p><h2>Who is still holding?</h2></div><div className="tabs"><button className={tab === "holders" ? "active" : ""} onClick={() => { setTab("holders"); setFilter("all"); }}>Holders <small>{number(data.split.scannedHolderCount)}</small></button><button className={tab === "buyers" ? "active" : ""} onClick={() => { setTab("buyers"); setFilter("all"); }}>Buyers <small>{data.pumpfunBuyers.uniqueBuyers}</small></button></div></section>
      <section className="table-card"><div className="filters">{(tab === "holders" ? [["all", "All"], ["fomo", "FOMO"], ["pumpfun_curve", "Curve"], ["creator", "Creator"], ["other", "Other"]] : [["all", "All"], ["fomo", "FOMO"], ["pumpfun", "Curve"], ["curve_only", "Pre only"], ["pumpswap_only", "Post only"], ["both", "Both"], ["holding", "Still holding"]]).map(([key, label]) => <button key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <div className="table-wrap"><table><thead><tr><th>#</th><th>Label</th><th>Owner</th><th>Handle</th>{tab === "buyers" && <th>Phase</th>}<th>{tab === "holders" ? "Tokens" : "Buy txs"}</th><th>% supply</th><th>Links</th></tr></thead><tbody>{rows.map((row, index) => <Row key={row.owner} row={row} index={index} buyers={tab === "buyers"} copy={copy} />)}</tbody></table></div>
        {!rows.length && <p className="empty">No addresses in this group yet.</p>}
      </section>
      {data.warnings.length > 0 && <section className="notice warnings"><b>Scan notes</b>{data.warnings.map(w => <p key={w}>{w}</p>)}</section>}
      <footer>FOMO wins the label priority. “Other” means self-custody or unknown — it is not a Phantom detector.</footer>
    </>}
  </main>;
}

function MixCard({ label, tone, data, detail }: { label: string; tone: string; data: ScanResponse["mix"]["fomo"]; detail: string }) { return <article className={`mix ${tone}`}><p>{label}</p><div className="mix-value">{number(data.buyers)} <small>{pct(data.pctOfBuyers)}</small></div><span>{detail}</span><div className="mix-bottom"><div><b>{pct(data.holdRate)}</b><small>hold rate</small></div><div><b>{pct(data.pctOfSupply)}</b><small>supply held</small></div></div></article>; }
function Metric({ title, value, sub, accent }: { title: string; value: string; sub: string; accent?: string }) { return <article className={`metric ${accent || ""}`}><p>{title}</p><strong>{value}</strong><small>{sub}</small></article>; }
function SupplyChart({ points }: { points: SupplySnapshot[] }) {
  const latest = points.at(-1);
  const width = 700, height = 190, inset = 18;
  const line = (field: keyof Pick<SupplySnapshot, "fomoPctOfSupply" | "preGradPctOfSupply" | "postGradPctOfSupply">) => points.map((point, index) => `${inset + (width - inset * 2) * (points.length === 1 ? .5 : index / (points.length - 1))},${height - inset - Math.min(100, point[field]) / 100 * (height - inset * 2)}`).join(" ");
  return <section className="table-card" style={{ padding: 20, marginTop: 18 }}><div className="section-head" style={{ marginBottom: 10 }}><div><p className="eyebrow">OWNERSHIP HISTORY</p><h2>Supply held over time</h2></div><small className="muted">{latest ? `${number(latest.holderCount)} holders · ${latest.holderIndexComplete ? "complete holder index" : "partial index"}` : "Snapshots start after the first scan"}</small></div>{points.length ? <><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Supply share history" style={{ width: "100%", height: 220, display: "block" }}><line x1={inset} x2={width - inset} y1={height - inset} y2={height - inset} stroke="rgba(255,255,255,.15)" /><polyline points={line("fomoPctOfSupply")} fill="none" stroke="#ff4ea3" strokeWidth="3" /><polyline points={line("preGradPctOfSupply")} fill="none" stroke="#ffc83d" strokeWidth="3" /><polyline points={line("postGradPctOfSupply")} fill="none" stroke="#67a8ff" strokeWidth="3" /></svg><div className="filters" style={{ padding: 0 }}><span className="handle">● FOMO {pct(latest?.fomoPctOfSupply || 0)}</span><span style={{ color: "#ffc83d" }}>● Pre-grad {pct(latest?.preGradPctOfSupply || 0)}</span><span style={{ color: "#67a8ff" }}>● Post-grad {pct(latest?.postGradPctOfSupply || 0)}</span><span className="muted">{time(points[0].observedAt)} → {time(latest!.observedAt)}</span></div></> : <p className="empty">No ownership snapshots yet. The chart begins automatically as this token is indexed.</p>}</section>;
}
function TokenIcon({ image, symbol }: { image: string | null; symbol: string }) { const [failed, setFailed] = useState(false); return <div className="token-icon" style={{ overflow: "hidden" }}>{image && !failed ? <img src={image} alt={`${symbol} token`} onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "◎"}</div>; }
function Row({ row, index, buyers, copy }: { row: Buyer | ScanResponse["holders"][number]; index: number; buyers: boolean; copy: (x: string) => void }) { const label = buyers ? (row as Buyer).bucket : (row as ScanResponse["holders"][number]).label; const handle = row.fomoHandle; const phase = buyers ? ({ curve_only: "Pre only", pumpswap_only: "Post only", both: "Both", other_dex: "DEX" } as const)[(row as Buyer).phase] : null; return <tr><td>{index + 1}</td><td><span className={`pill ${label}`}>{label.replace("pumpfun_", "")}</span></td><td><button className="owner" onClick={() => copy(row.owner)}>{short(row.owner)} <span>⧉</span></button></td><td>{handle ? <span className="handle">@{handle}</span> : <span className="muted">—</span>}</td>{buyers && <td>{phase}</td>}<td>{buyers ? number((row as Buyer).buyTxCount) : number((row as ScanResponse["holders"][number]).uiAmount)}</td><td>{pct(row.pctOfSupply)}</td><td><a href={`https://solscan.io/account/${row.owner}`} target="_blank" rel="noreferrer">↗</a></td></tr>; }
