import Link from "next/link";
import { DesktopShell, WindowPanel } from "./desktop-shell";

export default function NotFound() {
  return <DesktopShell active="tokens"><div className="workspace-stack"><section className="workspace-heading"><div><span className="kicker">404 / NO SIGNAL</span><h1>This route did not ape.</h1><p>The token or page could not be found.</p></div></section><WindowPanel title="Nothing here" className="state-window"><Link className="win-button primary" href="/">RETURN TO WHOAPED ↗</Link></WindowPanel></div></DesktopShell>;
}
