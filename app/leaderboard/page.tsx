import Link from "next/link";
import { SocialLeaderboard } from "../social-leaderboard";

export default function LeaderboardPage() {
  return <main className="product-shell"><nav className="app-nav"><Link className="wordmark" href="/">WHOAPED<span>•</span></Link><div><Link href="/">TOKENS</Link><Link className="active" href="/leaderboard">LEADERBOARD</Link></div><span className="live-state"><i />SOLANA LIVE</span></nav><section className="page-intro"><span className="kicker">KOLSCAN FOR SOCIAL TRADING</span><h1>Daily trader intelligence,<br />without mixing the evidence.</h1><p>Fomo’s official rolling 24-hour performance beside WHOAPED’s verified Pump wallet behavior. Every number keeps its provenance.</p></section><SocialLeaderboard /></main>;
}
