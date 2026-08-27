import type { Metadata } from "next";
import Link from "next/link";
import { DesktopShell, WindowPanel } from "../desktop-shell";

export const metadata: Metadata = { title: "Methodology — WHOAPED", description: "How WHOAPED verifies Pump and Fomo identities, positions, thesis evidence, and daily performance.", alternates: { canonical: "/methodology" } };

const methods = [
  ["Fomo daily board", "Authorized first-party rolling 24-hour observations captured from the visible Fomo leaderboard. FomoScan is not required."],
  ["Pump daily board", "Public Pump profiles are resolved to verified Solana wallets, then measured over a 90-day Dune batch. Win rate and capital-weighted return use closed token positions."],
  ["Sample confidence", "Pump scores are shrunk toward a neutral 50 until 20 closed positions are observed. A tiny lucky sample therefore cannot rank like a mature track record."],
  ["Token holders", "Pump and Fomo identities are matched only through a verified wallet relationship. Current holding state comes from token accounts; buys and sells come from decoded Pump curve and PumpSwap activity."],
  ["Thesis evidence", "A thesis needs attributable visible text, a profile, a Fomo/Pump source URL, and a timestamp. WHOAPED never converts a transaction into a supposed thesis."],
  ["Coverage", "Not ranked, not resolved, and not captured are displayed as missing coverage—not as zero, failure, or negative performance."],
] as const;

export default function MethodologyPage() {
  return <DesktopShell active="method"><div className="workspace-stack"><section className="workspace-heading"><div><span className="kicker">EVIDENCE BEFORE SIGNAL</span><h1>What every number actually means.</h1><p>Pump and Fomo live in one product, but their source windows are never silently mixed.</p></div></section><section className="method-grid">{methods.map(([title, detail], index) => <WindowPanel title={`0${index + 1} · ${title}`} key={title}><p>{detail}</p></WindowPanel>)}</section><WindowPanel title="Ready to verify" className="method-cta"><h2>Start with the token, then inspect the trader.</h2><div><Link className="win-button primary" href="/">SCAN A TOKEN ↗</Link><Link className="win-button" href="/leaderboard">OPEN DAILY BOARD ↗</Link></div></WindowPanel></div></DesktopShell>;
}
