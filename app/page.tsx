import Link from "next/link";
import { SocialLeaderboard } from "./social-leaderboard";
import { TokenLauncher } from "./token-launcher";
import { TrendingTokens } from "./trending-tokens";

export default function HomePage() {
  return <main className="product-shell">
    <nav className="app-nav"><Link className="wordmark" href="/">WHOAPED<span>•</span></Link><div><Link className="active" href="/">TOKENS</Link><Link href="/leaderboard">LEADERBOARD</Link></div><span className="live-state"><i />SOLANA LIVE</span></nav>
    <section className="command-hero"><div><span className="kicker">SOCIAL INTELLIGENCE / SOLANA</span><h1>See who aped.<br /><em>Understand why.</em></h1><p>Paste one token. WHOAPED puts Pump and Fomo holders, verified positions, and their public thesis in the same view.</p></div><TokenLauncher /></section>
    <section className="value-strip"><article><span>01</span><div><b>CROSS-PLATFORM HOLDERS</b><p>Pump + Fomo identities on one token.</p></div></article><article><span>02</span><div><b>POSITION TRUTH</b><p>Holding, trimmed, or exited—not screenshots.</p></div></article><article><span>03</span><div><b>THESIS EVIDENCE</b><p>What they said, linked and timestamped.</p></div></article></section>
    <TrendingTokens />
    <SocialLeaderboard preview />
    <footer className="product-footer"><b>WHOAPED</b><p>The KOLScan of social trading. Evidence first; coverage always visible.</p><Link href="/leaderboard">OPEN DAILY BOARD ↗</Link></footer>
  </main>;
}
