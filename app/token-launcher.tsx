"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TokenLauncher() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = value.trim();
    const fromUrl = input.match(/^https?:\/\/(?:www\.)?pump\.fun\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})\/?$/i)?.[1];
    const mint = fromUrl || input;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) { setError("Paste a Solana token CA or Pump.fun coin URL."); return; }
    setError("");
    router.push(`/token/${encodeURIComponent(mint)}`);
  }
  return <section className="panel token-launcher" aria-labelledby="token-launcher-title">
    <div className="panel-head"><div><p className="eyebrow">TOKEN INTELLIGENCE</p><h2 id="token-launcher-title">Who aped this token?</h2></div><span className="badge">LIVE BETA</span></div>
    <form onSubmit={submit}><label htmlFor="token-mint">Token CA or Pump.fun URL</label><div className="token-launch-row"><input id="token-mint" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste a Solana mint…" spellCheck={false} /><button type="submit">SCAN TOKEN ↗</button></div>{error ? <p className="error" role="alert">{error}</p> : <p className="hint">See verified Pump buyers, current top holders, hold status, and Fomo identities with explicit coverage.</p>}</form>
  </section>;
}
