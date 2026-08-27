import Link from "next/link";

type Section = "tokens" | "leaderboard" | "method";

export function DesktopShell({ active, children, status = "SOLANA LIVE" }: { active: Section; children: React.ReactNode; status?: string }) {
  return <main className="signal-app">
    <header className="signal-nav">
      <Link href="/" className="signal-brand">WHOAPED</Link>
      <span className="brand-note">Social trading intelligence</span>
      <nav aria-label="Primary navigation">
        <Link className={active === "tokens" ? "active" : ""} href="/">Explore</Link>
        <Link className={active === "leaderboard" ? "active" : ""} href="/leaderboard">Leaderboard</Link>
        <Link className={active === "method" ? "active" : ""} href="/methodology">Method</Link>
      </nav>
      <span className="network-state"><i className="status-light" />{status}</span>
    </header>
    <div className="signal-workspace">{children}</div>
    <footer className="signal-footer"><b>WHOAPED</b><span>Verified Pump + Fomo social intelligence.</span><Link href="/methodology">Methodology ↗</Link></footer>
  </main>;
}

export function WindowPanel({ title, children, className = "", actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return <section className={`signal-panel ${className}`.trim()}>
    <header className="signal-panel-head"><h2>{title}</h2><div>{actions}</div></header>
    <div className="signal-panel-content">{children}</div>
  </section>;
}
