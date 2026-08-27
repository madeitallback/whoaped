import type { Metadata } from "next";
import { SocialLeaderboard } from "../social-leaderboard";
import { DesktopShell } from "../desktop-shell";

export const metadata: Metadata = { title: "Pump + Fomo Leaderboard — WHOAPED", description: "Daily Pump wallet intelligence beside Fomo's official rolling 24-hour trader board.", alternates: { canonical: "/leaderboard" } };

export default function LeaderboardPage() {
  return <DesktopShell active="leaderboard"><div className="workspace-stack"><section className="workspace-heading"><div><span className="kicker">KOLSCAN FOR SOCIAL TRADING</span><h1>Daily trader intelligence.</h1><p>Fomo’s official rolling 24-hour performance beside WHOAPED’s verified Pump wallet behavior. Every number keeps its provenance.</p></div></section><SocialLeaderboard /></div></DesktopShell>;
}
