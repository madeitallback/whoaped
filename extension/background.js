const DEFAULT_ENDPOINT = "https://www.whoaped.xyz";

async function endpoint() {
  const { whoApedEndpoint, whoHeldEndpoint, followerAlphaEndpoint } = await chrome.storage.local.get(["whoApedEndpoint", "whoHeldEndpoint", "followerAlphaEndpoint"]);
  return (whoApedEndpoint || whoHeldEndpoint || followerAlphaEndpoint || DEFAULT_ENDPOINT).replace(/\/$/, "");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!["whoaped:follower-edge", "whoaped:fomo-follower-edge", "whoaped:fomo-followers", "whoaped:fomo-token-holders", "whoaped:fomo-observations", "whoaped:analyze", "whoaped:watch", "whoaped:capture-thesis", "whoheld:follower-edge", "whoheld:analyze", "whoheld:watch", "follower-alpha:analyze", "follower-alpha:watch"].includes(message?.type)) return;
  void (async () => {
    try {
      const base = await endpoint();
      if (message.type === "whoaped:follower-edge" || message.type === "whoheld:follower-edge") {
        const response = await fetch(`${base}/api/platforms/pump/follower-edge?address=${encodeURIComponent(message.wallet)}&sample=20`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "WHOAPED could not calculate Follower Edge.");
        sendResponse({ ok: true, data, endpoint: base });
        return;
      }
      if (message.type === "whoaped:fomo-follower-edge" || message.type === "whoaped:fomo-followers") {
        const collecting = message.type === "whoaped:fomo-followers";
        const response = await fetch(`${base}/api/platforms/fomo/follower-edge${collecting ? "" : `?handle=${encodeURIComponent(message.handle)}`}`, collecting ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: message.handle, followers: message.followers, visibleFollowerCount: message.visibleFollowerCount }),
        } : undefined);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "WHOAPED could not calculate Fomo Follower Edge.");
        sendResponse({ ok: true, data, endpoint: base });
        return;
      }
      if (message.type === "whoaped:capture-thesis") {
        const response = await fetch(`${base}/api/token/thesis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message.evidence) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "WHOAPED could not capture this thesis.");
        sendResponse({ ok: true, data, endpoint: base });
        return;
      }
      if (message.type === "whoaped:fomo-token-holders") {
        const response = await fetch(`${base}/api/platforms/fomo/token-holders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mint: message.mint, sourceUrl: message.sourceUrl, holders: message.holders }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "WHOAPED could not link the visible Fomo holders.");
        sendResponse({ ok: true, data, endpoint: base });
        return;
      }
      if (message.type === "whoaped:fomo-observations") {
        const response = await fetch(`${base}/api/platforms/fomo/observations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: message.sourceUrl, window: message.window, rows: message.rows }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "WHOAPED could not capture the Fomo leaderboard.");
        sendResponse({ ok: true, data, endpoint: base });
        return;
      }
      const watching = message.type === "whoaped:watch" || message.type === "whoheld:watch" || message.type === "follower-alpha:watch";
      const path = watching ? "/api/watchlist" : "/api/analyze";
      const body = watching
        ? { profileId: message.profileId }
        : { source: message.source, label: message.label, handle: message.handle, solanaAddress: message.wallet };
      const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "WHOAPED could not analyze this wallet.");
      sendResponse({ ok: true, data, endpoint: base });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "WHOAPED is unavailable." });
    }
  })();
  return true;
});
