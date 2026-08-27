import Link from "next/link";
import { SocialLeaderboard } from "./social-leaderboard";
import { TokenLauncher } from "./token-launcher";
import { TrendingTokens } from "./trending-tokens";
import { DesktopShell, WindowPanel } from "./desktop-shell";

export default function HomePage() {
  return <DesktopShell active="tokens"><div className="workspace-stack">
    <section className="workspace-heading"><div><span className="kicker">SOCIAL INTELLIGENCE / SOLANA</span><h1>Find the signal behind the holder list.</h1><p>One token view for Pump and Fomo profiles, verified wallet positions, performance, and public thesis.</p></div><Link className="win-button primary" href="/leaderboard">OPEN DAILY BOARD ↗</Link></section>
    <WindowPanel title="Search a token" className="lookup-window"><TokenLauncher /><div className="feature-status"><span><b>01</b> Cross-platform holders</span><span><b>02</b> Position truth</span><span><b>03</b> Thesis evidence</span></div></WindowPanel>
    <TrendingTokens />
    <SocialLeaderboard preview />
  </div></DesktopShell>;
}
