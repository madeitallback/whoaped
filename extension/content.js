(() => {
  if (window.top !== window) return;

  const isPump = window.location.hostname === "pump.fun";
  const isFomo = window.location.hostname === "fomo.family";
  const profileMatch = window.location.pathname.match(/^\/profile\/([^/?#]+)/);
  const base58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  function formatPercent(value) { return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—"; }
  function formatReturn(value) { return typeof value === "number" ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%` : "—"; }
  function formatHold(seconds) {
    if (typeof seconds !== "number") return "—";
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  }

  function walletTextNode() {
    if (!profileMatch) return null;
    const wallet = decodeURIComponent(profileMatch[1]);
    const compact = `${wallet.slice(0, 5)}…${wallet.slice(-4)}`;
    return [...document.querySelectorAll("main *")].find((element) => {
      if (element.children.length > 0) return false;
      const text = element.textContent?.trim() || "";
      return text.includes(compact) || text.includes(wallet.slice(0, 8));
    }) || null;
  }

  function handleTextNode() {
    if (!profileMatch) return null;
    const handle = decodeURIComponent(profileMatch[1]).toLowerCase();
    return [...document.querySelectorAll("body *")].find((element) => {
      if (element.children.length > 0) return false;
      const text = element.textContent?.trim().toLowerCase() || "";
      return text === `@${handle}` || text === handle;
    }) || null;
  }

  function profileAnchor() {
    const heading = document.querySelector("h1");
    if (heading) return heading;
    const walletNode = walletTextNode();
    // Pump's current profile UI renders its identity in divs rather than an h1.
    // Moving up three levels targets the compact profile card, not the address row.
    if (walletNode) return walletNode.parentElement?.parentElement?.parentElement || walletNode.parentElement;
    const handleNode = handleTextNode();
    return handleNode?.parentElement || handleNode || document.querySelector("main");
  }

  function profileLabel() {
    const heading = document.querySelector("h1, h2");
    if (heading?.textContent?.trim()) return heading.textContent.trim();
    const walletNode = walletTextNode();
    const nearbyText = walletNode?.parentElement?.parentElement?.textContent?.trim();
    return nearbyText?.split(/\n|\s{2,}/)[0]?.slice(0, 48) || handleTextNode()?.textContent?.trim().replace(/^@/, "") || profileMatch?.[1] || "Trader";
  }

  function fomoWalletFromPublicLinks() {
    const explorer = [...document.querySelectorAll("a[href]")].map((anchor) => anchor.href)
      .find((href) => /(?:solscan\.io\/account|explorer\.solana\.com\/address)\//.test(href));
    const address = explorer?.match(/(?:account|address)\/([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1];
    return address && base58.test(address) ? address : null;
  }

  function tokenMintFromUrl() {
    if (profileMatch) return null;
    const url = new URL(window.location.href);
    const queryCandidates = [url.searchParams.get("mint"), url.searchParams.get("token"), url.searchParams.get("address")];
    const segments = url.pathname.split("/").filter(Boolean);
    const routeCandidates = segments.some((segment) => /^(coin|token)$/i.test(segment)) ? segments : [];
    return [...queryCandidates, ...routeCandidates].find((candidate) => candidate && base58.test(candidate)) || null;
  }

  function selectedThesisEvidence() {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
    const mint = tokenMintFromUrl();
    if (!selection || selection.rangeCount === 0 || text.length < 3 || text.length > 4000 || !mint) return null;
    const range = selection.getRangeAt(0);
    const start = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const container = start?.closest?.("article, li, [data-testid*='comment'], [class*='comment']") || start?.parentElement;
    const profileAnchor = container?.querySelector?.('a[href*="/profile/"]') || start?.closest?.('a[href*="/profile/"]');
    const profileHref = profileAnchor?.getAttribute("href") || "";
    const platformProfileId = profileHref.match(/\/profile\/([^/?#]+)/)?.[1];
    if (!platformProfileId) return null;
    const profileUrl = new URL(profileHref, window.location.origin).toString();
    const time = container?.querySelector?.("time[datetime]")?.getAttribute("datetime") || null;
    const decodedProfileId = decodeURIComponent(platformProfileId);
    return {
      mint,
      platform: isPump ? "pump" : "fomo",
      platformProfileId: decodedProfileId,
      handle: base58.test(decodedProfileId) ? null : decodedProfileId,
      displayName: profileAnchor?.textContent?.trim().replace(/^@/, "").slice(0, 128) || null,
      profileUrl,
      sourceUrl: window.location.href,
      sourceText: text,
      publishedAt: time,
      relevance: text.includes(mint) ? "explicit" : "contextual",
    };
  }

  function mountThesisCapture() {
    document.querySelector("#whoaped-thesis-capture")?.remove();
    const evidence = selectedThesisEvidence();
    if (!evidence) return;
    const button = document.createElement("button");
    button.id = "whoaped-thesis-capture";
    button.type = "button";
    button.textContent = "WHOAPED · CAPTURE THESIS";
    const selectionBox = window.getSelection().getRangeAt(0).getBoundingClientRect();
    button.style.left = `${Math.max(12, Math.min(selectionBox.left, window.innerWidth - 230))}px`;
    button.style.top = `${Math.max(12, selectionBox.bottom + 8)}px`;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "CAPTURING…";
      const result = await chrome.runtime.sendMessage({ type: "whoaped:capture-thesis", evidence });
      button.textContent = result?.ok ? "✓ THESIS CAPTURED" : result?.error || "CAPTURE FAILED";
      setTimeout(() => button.remove(), result?.ok ? 1800 : 5000);
    });
    document.documentElement.append(button);
  }

  function pumpWalletFromProfile() {
    const identity = profileMatch ? decodeURIComponent(profileMatch[1]) : "";
    if (base58.test(identity)) return identity;
    const profileImage = [...document.querySelectorAll("img[alt]")].find((image) => /profile picture/i.test(image.alt || ""));
    const address = profileImage?.alt?.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)?.[0];
    return address && base58.test(address) ? address : null;
  }

  function mountInline(anchor) {
    if (document.querySelector("#follower-alpha-inline")) return document.querySelector("#follower-alpha-inline");
    const card = document.createElement("section");
    card.id = "follower-alpha-inline";
    card.innerHTML = `<div class="fa-inline-head"><span class="fa-inline-mark">↗</span><span>WHOAPED</span><span class="fa-inline-live">LIVE</span><button class="fa-inline-close" type="button" aria-label="Close WHOAPED">×</button></div><div class="fa-inline-loading">Reading verified on-chain wallet activity…</div>`;
    document.body.append(card);
    const place = () => {
      if (!card.isConnected || !anchor.isConnected) return;
      const anchorBox = anchor.getBoundingClientRect();
      const cardWidth = Math.min(320, window.innerWidth - 32);
      const cardHeight = card.offsetHeight || 110;
      const top = Math.max(84, Math.min(anchorBox.top - 2, window.innerHeight - cardHeight - 16));
      const preferredLeft = Math.max(16, Math.min(anchorBox.right + 22, window.innerWidth - cardWidth - 16));
      const leftFallback = anchorBox.left - cardWidth - 22;
      const followButtons = [...document.querySelectorAll("button")].filter((button) => /follow/i.test(button.textContent || ""));
      const overlapsFollow = (left) => followButtons.some((button) => {
        const box = button.getBoundingClientRect();
        return left < box.right && left + cardWidth > box.left && top < box.bottom && top + cardHeight > box.top;
      });
      const left = overlapsFollow(preferredLeft) && leftFallback >= 16 && !overlapsFollow(leftFallback) ? leftFallback : preferredLeft;
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    };
    requestAnimationFrame(place);
    window.addEventListener("resize", place, { passive: true });
    window.addEventListener("scroll", place, { passive: true });
    bindClose(card);
    return card;
  }

  function bindClose(card) {
    card.querySelector(".fa-inline-close")?.addEventListener("click", () => card.remove());
  }

  function renderUnavailable(card, message) {
    card.innerHTML = `<div class="fa-inline-head"><span class="fa-inline-mark">↗</span><span>WHOAPED</span><button class="fa-inline-close" type="button" aria-label="Close WHOAPED">×</button></div><p class="fa-inline-message">${message}</p>`;
    bindClose(card);
    window.dispatchEvent(new Event("resize"));
  }

  function renderMetrics(card, profile, endpoint) {
    const metrics = profile.metrics;
    const noOnchainHistory = !profile.trades?.length;
    const score = metrics.score ?? "—";
    const scoreClass = typeof metrics.score === "number" && metrics.score >= 60 ? "high" : "";
    card.innerHTML = `<div class="fa-inline-head"><span class="fa-inline-mark">↗</span><span>WHOAPED</span><span class="fa-inline-live">LIVE</span><button class="fa-inline-close" type="button" aria-label="Close WHOAPED">×</button></div><div class="fa-inline-main"><div class="fa-inline-score ${scoreClass}"><b>${score}</b><span>PERF BETA</span></div><div class="fa-inline-stat"><span>WIN RATE</span><b>${formatPercent(metrics.winRate)}</b></div><div class="fa-inline-stat"><span>WEIGHTED RETURN</span><b class="${(metrics.capitalWeightedReturn ?? 0) >= 0 ? "up" : "down"}">${formatReturn(metrics.capitalWeightedReturn)}</b></div><div class="fa-inline-stat"><span>MEDIAN HOLD</span><b>${formatHold(metrics.medianHoldSeconds)}</b></div></div><div class="fa-inline-foot"><span>${noOnchainHistory ? "○ no public Solana swaps found" : metrics.active ? "● active trader" : "○ no activity in last 30d"}</span><button type="button" class="fa-inline-watch">+ WATCH</button><a href="${endpoint}/?wallet=${encodeURIComponent(profile.wallets[0].address)}&source=${encodeURIComponent(profile.source)}" target="_blank" rel="noreferrer">DETAILS ↗</a></div>`;
    bindClose(card);
    window.dispatchEvent(new Event("resize"));
    card.querySelector(".fa-inline-watch").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.textContent = "ADDING…";
      const result = await chrome.runtime.sendMessage({ type: "whoaped:watch", profileId: profile.id });
      button.textContent = result?.ok ? "✓ WATCHING" : "RETRY";
    });
  }

  function renderFollowerEdge(card, metrics, endpoint, wallet, label) {
    const edge = typeof metrics.followerEdge === "number" ? `${(metrics.followerEdge * 100).toFixed(1)}%` : "—";
    card.innerHTML = `<div class="fa-inline-head"><span class="fa-inline-mark">↗</span><span>WHOAPED</span><span class="fa-inline-live">LIVE</span><button class="fa-inline-close" type="button" aria-label="Close WHOAPED">×</button></div><div class="fa-inline-main"><div class="fa-inline-score"><b>${edge}</b><span>FOLLOWER EDGE</span></div><div class="fa-inline-stat"><span>PROFITABLE / SCORABLE</span><b>${metrics.profitableFollowers} / ${metrics.scorableFollowers}</b></div><div class="fa-inline-stat"><span>ACTIVE 30D</span><b>${metrics.activeFollowers30d} / ${metrics.sampledFollowers}</b></div><div class="fa-inline-stat"><span>CONFIDENCE</span><b>${String(metrics.confidence || "low").toUpperCase()}</b></div></div><div class="fa-inline-foot"><span>${metrics.status === "ready" ? `● ${metrics.sampledFollowers} sampled / ${Number(metrics.visibleFollowers).toLocaleString()}` : "○ follower data unavailable"}</span><a href="${endpoint}/?followerWallet=${encodeURIComponent(wallet)}&followerLabel=${encodeURIComponent(label)}" target="_blank" rel="noreferrer">DETAILS ↗</a></div>`;
    bindClose(card);
    window.dispatchEvent(new Event("resize"));
  }

  async function analyzeFollowerEdge(wallet) {
    const anchor = profileAnchor();
    if (!anchor) return false;
    const card = mountInline(anchor);
    const result = await chrome.runtime.sendMessage({ type: "whoaped:follower-edge", wallet });
    if (!result?.ok) {
      renderUnavailable(card, result?.error || "WHOAPED could not calculate Follower Edge for this Pump profile.");
      return true;
    }
    renderFollowerEdge(card, result.data, result.endpoint, wallet, profileLabel());
    return true;
  }

  async function analyzeProfile(wallet, source, handle) {
    const anchor = profileAnchor();
    if (!anchor) return false;
    const card = mountInline(anchor);
    const result = await chrome.runtime.sendMessage({ type: "whoaped:analyze", wallet, source, label: profileLabel(), handle });
    if (!result?.ok) {
      renderUnavailable(card, result?.error || "Start WHOAPED locally, then reload this profile.");
      return true;
    }
    renderMetrics(card, result.data, result.endpoint);
    return true;
  }

  async function mountProfileEmbed() {
    if (!profileMatch || (!isPump && !isFomo)) return;
    const identity = decodeURIComponent(profileMatch[1]);
    if (isPump) {
      const wallet = pumpWalletFromProfile();
      if (wallet) { await analyzeFollowerEdge(wallet); return; }
    }
    if (isFomo) {
      const wallet = fomoWalletFromPublicLinks();
      if (wallet) { await analyzeProfile(wallet, "fomo", identity); return; }
      const anchor = profileAnchor();
      if (anchor) renderUnavailable(mountInline(anchor), `No public Solana wallet is linked on this Fomo profile. <a href="https://fomowalletfinder.com/?handle=${encodeURIComponent(identity)}" target="_blank" rel="noreferrer">Resolve on Fomo Wallet Finder ↗</a>`);
    }
  }

  function mountLeaderboardImporter() {
    const path = window.location.pathname;
    if ((!isPump && !isFomo) || profileMatch || (!path.includes("leaderboard") && !path.includes("profiles"))) return;
    const links = [...document.querySelectorAll('a[href^="/profile/"]')];
    if (!links.length || document.querySelector("#follower-alpha-launcher")) return;
    const root = document.createElement("aside"); root.id = "follower-alpha-launcher";
    root.innerHTML = `<button class="fa-close" title="Close">×</button><div class="fa-kicker">WHOAPED / PILOT</div><div class="fa-title">${isPump ? "Analyze visible Pump wallets" : "Queue visible Fomo traders"}</div><div class="fa-note">${isPump ? "Creates individual Wallet Performance Beta results for up to 12 visible profiles." : "A public wallet mapping is required before a Fomo trader can be analyzed."}</div><button>QUEUE VISIBLE PROFILES</button>`;
    const brandStyle = document.createElement("style");
    brandStyle.textContent = '#follower-alpha-launcher:before{content:"WHOAPED Profile Import"}';
    root.append(brandStyle);
    root.querySelector(".fa-close").onclick = () => root.remove();
    root.querySelector("button:not(.fa-close)").onclick = () => {
      const candidates = [...new Map(links.map((link) => { const address = link.getAttribute("href").split("/").pop(); return [address, { source: "pump", label: link.textContent.trim().slice(0, 48) || address, solanaAddress: address }]; })).values()].filter((item) => base58.test(item.solanaAddress)).slice(0, 12);
      chrome.storage.local.get(["whoApedEndpoint", "whoHeldEndpoint", "followerAlphaEndpoint"], ({ whoApedEndpoint, whoHeldEndpoint, followerAlphaEndpoint }) => {
        const base = (whoApedEndpoint || whoHeldEndpoint || followerAlphaEndpoint || "https://whoaped-phi.vercel.app").replace(/\/$/, "");
        const params = isPump ? { candidates: btoa(JSON.stringify(candidates)) } : { fomoCandidates: btoa(JSON.stringify([...new Set(links.map((link) => link.getAttribute("href").split("/").pop()))].slice(0, 12))) };
        window.open(`${base}/?${new URLSearchParams(params).toString()}`, "_blank", "noopener");
      });
    };
    document.documentElement.append(root);
  }

  let attempts = 0;
  const waitForProfile = () => {
    void mountProfileEmbed(); mountLeaderboardImporter();
    attempts += 1;
    if (!document.querySelector("#follower-alpha-inline") && attempts < 15) setTimeout(waitForProfile, 600);
  };
  setTimeout(waitForProfile, 700);
  document.addEventListener("mouseup", () => setTimeout(mountThesisCapture, 0));
})();
