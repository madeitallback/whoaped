"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { TrendingToken } from "@/lib/token-intel/trending";

const usd = (value: number | null, compact = false) => value === null ? "—" : new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: value < 1 && !compact ? 6 : 2,
}).format(value);

export function TrendingTokens() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/tokens/trending?limit=12");
      const body = await response.json() as { tokens?: TrendingToken[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Trending tokens are unavailable.");
      setTokens(body.tokens || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trending tokens are unavailable.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="panel trending-board" aria-live="polite" aria-busy={loading}>
    <div className="board-head"><div><p className="eyebrow">LIVE DISCOVERY / BIRDEYE SOLANA</p><h2>Trending now</h2><p>Open a token to see verified Pump buyers, current holders, Fomo identities, and attributable thesis evidence.</p></div><button className="row-open" type="button" onClick={() => void load()} disabled={loading}>{loading ? "REFRESHING…" : "REFRESH ↻"}</button></div>
    {error ? <p className="inline-notice">{error}</p> : null}
    <div className="trending-grid">{tokens.map((token) => <Link className="trending-card" href={`/token/${encodeURIComponent(token.mint)}`} key={token.mint}>
      <div className="trending-card-top"><span className="rank">#{String(token.rank).padStart(2, "0")}</span><span className={(token.priceChange24hPct ?? 0) >= 0 ? "positive" : "negative"}>{token.priceChange24hPct === null ? "—" : `${token.priceChange24hPct >= 0 ? "+" : ""}${token.priceChange24hPct.toFixed(1)}%`}</span></div>
      <div className="trending-token-title">{token.imageUrl ? <Image src={token.imageUrl} alt="" width={30} height={30} sizes="30px" /> : <span>{token.symbol.slice(0, 1)}</span>}<strong>{token.symbol}</strong></div><span className="trending-name">{token.name}</span><b>{usd(token.priceUsd)}</b>
      <small>VOL {usd(token.volume24hUsd, true)} · LIQ {usd(token.liquidityUsd, true)}</small><em>SEE WHO APED ↗</em>
    </Link>)}</div>
    {!loading && !error && tokens.length === 0 ? <p className="inline-notice">Birdeye returned no Solana trending tokens.</p> : null}
  </section>;
}
