import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Methodology — WHOAPED", description: "How WHOAPED verifies Pump and Fomo identities, positions, thesis evidence, and daily performance.", alternates: { canonical: "/methodology" } };

const methods = [
  ["Fomo daily board", "Official FomoScan rolling 24-hour realized PnL, trades, and volume. These are source metrics, not reconstructed by WHOAPED."],
  ["Pump daily board", "Public Pump profiles are resolved to verified Solana wallets, then measured over a 90-day Dune batch. Win rate and capital-weighted return use closed token positions."],
  ["Sample confidence", "Pump scores are shrunk toward a neutral 50 until 20 closed positions are observed. A tiny lucky sample therefore cannot rank like a mature track record."],
  ["Token holders", "Pump and Fomo identities are matched only through a verified wallet relationship. Current holding state comes from token accounts; buys and sells come from decoded Pump curve and PumpSwap activity."],
  ["Thesis evidence", "A thesis needs attributable public text, a profile, a source URL, and a timestamp. FomoScan is the automated provider today. WHOAPED never converts a transaction into a supposed thesis."],
  ["Coverage", "Not ranked, not resolved, and not captured are displayed as missing coverage—not as zero, failure, or negative performance."],
] as const;

export default function MethodologyPage() {
  return <main className="product-shell"><nav className="app-nav"><Link className="wordmark" href="/">WHOAPED<span>•</span></Link><div><Link href="/">TOKENS</Link><Link href="/leaderboard">LEADERBOARD</Link><Link className="active" href="/methodology">METHOD</Link></div><span className="live-state"><i />SOLANA LIVE</span></nav><section className="page-intro"><span className="kicker">EVIDENCE BEFORE SIGNAL</span><h1>What every WHOAPED<br />number actually means.</h1><p>Pump and Fomo live in one product, but their source windows are never silently mixed.</p></section><section className="method-grid">{methods.map(([title, detail], index) => <article className="terminal-panel" key={title}><span className="kicker">0{index + 1}</span><h2>{title}</h2><p>{detail}</p></article>)}</section><section className="method-cta terminal-panel"><div><span className="kicker">READY TO VERIFY</span><h2>Start with the token, then inspect the trader.</h2></div><div><Link href="/">SCAN A TOKEN ↗</Link><Link href="/leaderboard">OPEN DAILY BOARD ↗</Link></div></section></main>;
}
