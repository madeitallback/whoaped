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
    const routeCandidates = segments;
    return [...queryCandidates, ...routeCandidates].find((candidate) => candidate && base58.test(candidate)) || null;
  }

  function parseMoney(text) {
    const normalized = String(text || "").replace(/[$,+%]/g, "").replace(/,/g, "").trim();
    const match = normalized.match(/^(-?[0-9]+(?:\.[0-9]+)?)([KMB])?$/i);
    if (!match) return null;
    const multiplier = match[2]?.toUpperCase() === "B" ? 1e9 : match[2]?.toUpperCase() === "M" ? 1e6 : match[2]?.toUpperCase() === "K" ? 1e3 : 1;
    const value = Number(match[1]) * multiplier;
    return Number.isFinite(value) ? value : null;
  }

  function visibleTradeEvents(scope) {
    const events = [];
    for (const row of scope.querySelectorAll("tr, li, article, [role='row']")) {
      const text = (row.innerText || "").replace(/\s+/g, " ").trim();
      const side = /\bbuy\b/i.test(text) ? "buy" : /\bsell\b/i.test(text) ? "sell" : null;
      if (!side) continue;
      const timeValue = row.querySelector("time")?.getAttribute("datetime") || row.querySelector("time")?.textContent || text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0];
      if (!timeValue) continue;
      let occurredAt = Date.parse(timeValue);
      if (!Number.isFinite(occurredAt) && /^\d{1,2}:\d{2}/.test(timeValue)) {
        const now = new Date(); const [hours, minutes, seconds = "0"] = timeValue.split(":");
        now.setHours(Number(hours), Number(minutes), Number(seconds), 0); occurredAt = now.valueOf();
      }
      if (!Number.isFinite(occurredAt)) continue;
      const amount = text.match(/([\d,.]+(?:\.\d+)?[KMB]?)\s+[A-Za-z][A-Za-z0-9._-]{0,15}/i)?.[1];
      events.push({ side, occurredAt: new Date(occurredAt).toISOString(), amountUi: parseMoney(amount) });
    }
    return events.slice(0, 20);
  }

  function visibleFomoTokenHolders() {
    if (!isFomo || !tokenMintFromUrl()) return [];
    const holders = new Map();
    for (const element of document.querySelectorAll("button, article, li")) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || box.bottom < 0 || box.top > window.innerHeight) continue;
      const lines = (element.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
      const amountLine = lines.find((line) => /^[\d,.]+(?:\.\d+)?[KMB]?\s+[A-Za-z][A-Za-z0-9._-]{0,15}$/i.test(line));
      const profileLink = element.querySelector?.('a[href*="/profile/"]');
      const linkedHandle = profileLink?.getAttribute("href")?.match(/\/profile\/([^/?#]+)/)?.[1];
      const handle = linkedHandle ? decodeURIComponent(linkedHandle) : lines[0]?.replace(/^@/, "");
      if (!amountLine || !handle || base58.test(handle) || handle.length > 128) continue;
      const moneyLines = lines.filter((line) => /^[+-]?\$[\d,.]+(?:\.\d+)?$/.test(line));
      const roiLine = lines.find((line) => /^[+-]?[\d,.]+(?:\.\d+)?%$/.test(line));
      holders.set(handle.toLowerCase(), {
        handle,
        amountText: amountLine.split(/\s+/)[0],
        avatarUrl: element.querySelector?.("img[src]")?.src || null,
        thesisText: lines.find((line) => line.length >= 12 && /thesis|because|holding|conviction/i.test(line)) || null,
        holdTimeText: lines.find((line) => /avg\.?\s*hold|hold time|external wallet/i.test(line)) || null,
        valueUsd: parseMoney(moneyLines[0]),
        pnlUsd: parseMoney(moneyLines[1]),
        roiPct: parseMoney(roiLine),
        trades: visibleTradeEvents(element),
      });
    }
    return [...holders.values()].slice(0, 100);
  }

  function fomoLeaderboardWindow() {
    const text = `${window.location.search} ${document.querySelector('[aria-selected="true"], [data-state="active"]')?.textContent || ""}`.toLowerCase();
    if (/\b7d\b|7-days?|7days?/.test(text)) return "7d";
    if (/\b30d\b|30-days?|30days?/.test(text)) return "30d";
    if (/\ball\b/.test(text)) return "all";
    return "24h";
  }

  function visibleFomoLeaderboardRows() {
    const anchors = [...document.querySelectorAll('a[href*="/profile/"]')];
    const rows = new Map();
    for (const anchor of anchors) {
      const match = anchor.getAttribute("href")?.match(/\/profile\/([^/?#]+)/);
      if (!match) continue;
      const handle = decodeURIComponent(match[1]).replace(/^@/, "");
      if (!handle || base58.test(handle)) continue;
      const container = anchor.closest("tr, [role='row'], article, li") || anchor;
      if (!container) continue;
      const box = container.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const text = (container.innerText || "").replace(/\s+/g, " ").trim();
      const rankText = text.match(/(?:^|\s)#?(\d{1,5})(?:\s|$)/)?.[1];
      const money = [...text.matchAll(/[+-]?\$[\d,.]+(?:\.\d+)?[KMB]?/gi)].map((entry) => parseMoney(entry[0])).filter((value) => value !== null);
      const followerText = text.match(/([\d,.]+(?:\.\d+)?[KMB]?)\s+followers?/i)?.[1];
      const tradeText = text.match(/([\d,.]+(?:\.\d+)?[KMB]?)\s+trades?/i)?.[1];
      const volumeText = text.match(/(?:volume|vol)\s*[:$]?\s*([\d,.]+(?:\.\d+)?[KMB]?)/i)?.[1];
      const handleMarker = `@${handle}`;
      const markerIndex = text.toLowerCase().indexOf(handleMarker.toLowerCase());
      const displayName = (markerIndex > 0 ? text.slice(0, markerIndex) : anchor.textContent || handle).replace(/^\s*#?\d+\s*\.?\s*/, "").trim();
      const compactCount = text.match(/\s(\d{1,6})\s*\+?\s*$/)?.[1];
      rows.set(handle.toLowerCase(), {
        handle,
        displayName: displayName.slice(0, 128) || handle,
        avatarUrl: container.querySelector("img[src]")?.src || null,
        platformRank: rankText ? Number(rankText) : rows.size + 1,
        realizedPnlUsd: money[0] ?? null,
        volumeUsd: volumeText ? parseMoney(volumeText) : money[1] ?? null,
        tradeCount: tradeText ? parseMoney(tradeText) : compactCount ? Number(compactCount) : null,
        followerCount: followerText ? parseMoney(followerText) : null,
      });
    }
    return [...rows.values()].slice(0, 500);
  }

  function mountFomoTokenHolderSync() {
    const mint = tokenMintFromUrl();
    if (!isFomo || !mint || document.querySelector("#whoaped-holder-sync")) return;
    const root = document.createElement("aside");
    root.id = "whoaped-holder-sync";
    root.innerHTML = `<b>WHOAPED HOLDER MAP</b><span>Link visible Fomo profiles to their verified Solana balances.</span><button type="button">SYNC VISIBLE HOLDERS ↗</button><small>Only visible holder rows are sent after your click. No cookies or session data.</small>`;
    root.querySelector("button").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const holders = visibleFomoTokenHolders();
      if (!holders.length) {
        button.textContent = "SCROLL TO HOLDERS, THEN RETRY";
        setTimeout(() => { button.textContent = "SYNC VISIBLE HOLDERS ↗"; }, 3500);
        return;
      }
      button.disabled = true;
      button.textContent = `LINKING ${holders.length} VISIBLE HOLDERS…`;
      const result = await chrome.runtime.sendMessage({ type: "whoaped:fomo-token-holders", mint, sourceUrl: window.location.href, holders });
      button.disabled = false;
      button.textContent = result?.ok ? `✓ ${result.data.linked} LINKED · ${result.data.unresolved} PENDING` : result?.error || "RETRY SYNC";
    });
    document.documentElement.append(root);
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
    card.innerHTML = `<div class="fa-inline-head"><span class="fa-inline-mark">↗</span><span>WHOAPED</span><span class="fa-inline-live">LIVE</span><button class="fa-inline-close" type="button" aria-label="Close WHOAPED">×</button></div><div class="fa-inline-main"><div class="fa-inline-score ${scoreClass}"><b>${score}</b><span>WR + RETURN</span></div><div class="fa-inline-stat"><span>WIN RATE</span><b>${formatPercent(metrics.winRate)}</b></div><div class="fa-inline-stat"><span>WEIGHTED RETURN</span><b class="${(metrics.capitalWeightedReturn ?? 0) >= 0 ? "up" : "down"}">${formatReturn(metrics.capitalWeightedReturn)}</b></div><div class="fa-inline-stat"><span>MEDIAN HOLD</span><b>${formatHold(metrics.medianHoldSeconds)}</b></div></div><div class="fa-inline-foot"><span>${noOnchainHistory ? "○ no public Solana swaps found" : metrics.active ? "● active trader" : "○ no activity in last 30d"}</span><button type="button" class="fa-inline-watch">+ WATCH</button><a href="${endpoint}/?wallet=${encodeURIComponent(profile.wallets[0].address)}&source=${encodeURIComponent(profile.source)}" target="_blank" rel="noreferrer">DETAILS ↗</a></div>`;
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
    card.innerHTML = `<div class="fa-inline-head"><span class="fa-inline-mark">↗</span><span>WHOAPED</span><span class="fa-inline-live">LIVE</span><button class="fa-inline-close" type="button" aria-label="Close WHOAPED">×</button></div><div class="fa-inline-main"><div class="fa-inline-score"><b>${edge}</b><span>FOLLOWER EDGE</span></div><div class="fa-inline-stat"><span>PROFITABLE / SCORABLE</span><b>${metrics.profitableFollowers} / ${metrics.scorableFollowers}</b></div><div class="fa-inline-stat"><span>ACTIVE 30D</span><b>${metrics.activeFollowers30d} / ${metrics.sampledFollowers}</b></div><div class="fa-inline-stat"><span>WALLETS MAPPED</span><b>${metrics.scorableFollowers} / ${metrics.sampledFollowers}</b></div></div><div class="fa-inline-foot"><span>${metrics.status === "ready" ? `● ${metrics.sampledFollowers} sampled / ${Number(metrics.visibleFollowers).toLocaleString()}` : "○ follower data unavailable"}</span><a href="${endpoint}/?followerWallet=${encodeURIComponent(wallet)}&followerLabel=${encodeURIComponent(label)}" target="_blank" rel="noreferrer">DETAILS ↗</a></div>`;
    bindClose(card);
    window.dispatchEvent(new Event("resize"));
  }

  function visibleFomoFollowerHandles(ownerHandle) {
    const scope = document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (!scope) return [];
    const handles = new Map();
    for (const anchor of scope.querySelectorAll('a[href*="/profile/"]')) {
      const box = anchor.getBoundingClientRect();
      if (!box.width || !box.height || box.bottom < 0 || box.top > window.innerHeight) continue;
      const match = anchor.getAttribute("href")?.match(/\/profile\/([^/?#]+)/);
      if (!match) continue;
      const handle = decodeURIComponent(match[1]).replace(/^@/, "");
      if (!handle || handle.toLowerCase() === ownerHandle.toLowerCase() || base58.test(handle)) continue;
      handles.set(handle.toLowerCase(), handle);
    }
    return [...handles.values()];
  }

  function visibleFomoFollowerCount() {
    const text = document.body.innerText;
    const match = text.match(/([\d,.]+)\s+followers?/i) || text.match(/followers?\s*([\d,.]+)/i);
    if (!match) return null;
    const count = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(count) ? count : null;
  }

  function renderFomoCollector(card, handle, cached, endpoint) {
    const ready = cached?.status === "ready" || cached?.status === "insufficient";
    const edge = typeof cached?.followerEdge === "number" ? `${(cached.followerEdge * 100).toFixed(1)}%` : "—";
    card.innerHTML = `<div class="fa-inline-head"><span class="fa-inline-mark">↗</span><span>WHOAPED</span><span class="fa-inline-live">FOMO</span><button class="fa-inline-close" type="button" aria-label="Close WHOAPED">×</button></div>${ready ? `<div class="fa-inline-main"><div class="fa-inline-score"><b>${edge}</b><span>FOLLOWER EDGE</span></div><div class="fa-inline-stat"><span>PROFITABLE / SCORABLE</span><b>${cached.profitableFollowers} / ${cached.scorableFollowers}</b></div><div class="fa-inline-stat"><span>ACTIVE 30D</span><b>${cached.activeFollowers30d} / ${cached.sampledFollowers}</b></div><div class="fa-inline-stat"><span>WALLETS MAPPED</span><b>${cached.scorableFollowers} / ${cached.sampledFollowers}</b></div></div>` : `<p class="fa-inline-message">Open this profile's <b>Followers</b> list. WHOAPED reads only the visible profile links after your click—never cookies or session tokens.</p>`}<div class="fa-fomo-actions"><button type="button" class="fa-collect-followers">ANALYZE VISIBLE FOLLOWERS ↗</button><span>First-party identities → verified on-chain history</span></div><div class="fa-inline-foot"><span>${ready ? `● saved snapshot · ${cached.sampledFollowers} wallets sampled` : "○ explicit collection required"}</span><a href="${endpoint}/?source=fomo&handle=${encodeURIComponent(handle)}&followerPlatform=fomo&followerHandle=${encodeURIComponent(handle)}" target="_blank" rel="noreferrer">DETAILS ↗</a></div>`;
    bindClose(card);
    card.querySelector(".fa-collect-followers")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const followers = visibleFomoFollowerHandles(handle);
      if (!followers.length) {
        button.textContent = "OPEN FOLLOWERS, THEN RETRY";
        setTimeout(() => { button.textContent = "ANALYZE VISIBLE FOLLOWERS ↗"; }, 3500);
        return;
      }
      button.disabled = true;
      button.textContent = `RESOLVING ${followers.length} VISIBLE PROFILES…`;
      const result = await chrome.runtime.sendMessage({ type: "whoaped:fomo-followers", handle, followers, visibleFollowerCount: visibleFomoFollowerCount() });
      if (!result?.ok) {
        button.disabled = false;
        button.textContent = result?.error || "RETRY COLLECTION";
        return;
      }
      renderFomoCollector(card, handle, result.data, result.endpoint);
    });
    window.dispatchEvent(new Event("resize"));
  }

  async function mountFomoFollowerEdge(handle) {
    const anchor = profileAnchor();
    if (!anchor) return false;
    const card = mountInline(anchor);
    const result = await chrome.runtime.sendMessage({ type: "whoaped:fomo-follower-edge", handle });
    renderFomoCollector(card, handle, result?.ok ? result.data : null, result?.endpoint || "https://www.whoaped.xyz");
    return true;
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
      await mountFomoFollowerEdge(identity);
      return;
    }
  }

  function mountLeaderboardImporter() {
    const path = window.location.pathname;
    if ((!isPump && !isFomo) || profileMatch) return;
    if (isPump && !path.includes("leaderboard") && !path.includes("profiles")) return;
    const links = [...document.querySelectorAll('a[href^="/profile/"]')];
    if (!links.length || document.querySelector("#follower-alpha-launcher")) return;
    const root = document.createElement("aside"); root.id = "follower-alpha-launcher";
    root.innerHTML = `<button class="fa-close" title="Close">×</button><div class="fa-kicker">WHOAPED / LIVE SOURCE</div><div class="fa-title">${isPump ? "Analyze visible Pump wallets" : "Sync the visible Fomo leaderboard"}</div><div class="fa-note">${isPump ? "Creates transparent wallet results for up to 12 visible profiles." : "Persists rank, PnL, avatar and profile source directly from your authorized Fomo session. FomoScan is not used."}</div><button>${isPump ? "QUEUE VISIBLE PROFILES" : "SYNC VISIBLE FOMO ROWS ↗"}</button>`;
    const brandStyle = document.createElement("style");
    brandStyle.textContent = '#follower-alpha-launcher:before{content:"WHOAPED Profile Import"}';
    root.append(brandStyle);
    root.querySelector(".fa-close").onclick = () => root.remove();
    root.querySelector("button:not(.fa-close)").onclick = async (event) => {
      if (isFomo) {
        const button = event.currentTarget;
        const rows = visibleFomoLeaderboardRows();
        if (!rows.length) { button.textContent = "SCROLL TO THE BOARD, THEN RETRY"; return; }
        button.disabled = true; button.textContent = `SYNCING ${rows.length} FOMO PROFILES…`;
        const result = await chrome.runtime.sendMessage({ type: "whoaped:fomo-observations", sourceUrl: window.location.href, window: fomoLeaderboardWindow(), rows });
        button.disabled = false; button.textContent = result?.ok ? `✓ ${result.data.captured} FOMO PROFILES SAVED` : result?.error || "RETRY SYNC";
        return;
      }
      const candidates = [...new Map(links.map((link) => { const address = link.getAttribute("href").split("/").pop(); return [address, { source: "pump", label: link.textContent.trim().slice(0, 48) || address, solanaAddress: address }]; })).values()].filter((item) => base58.test(item.solanaAddress)).slice(0, 12);
      chrome.storage.local.get(["whoApedEndpoint", "whoHeldEndpoint", "followerAlphaEndpoint"], ({ whoApedEndpoint, whoHeldEndpoint, followerAlphaEndpoint }) => {
        const base = (whoApedEndpoint || whoHeldEndpoint || followerAlphaEndpoint || "https://www.whoaped.xyz").replace(/\/$/, "");
        const params = { candidates: btoa(JSON.stringify(candidates)) };
        window.open(`${base}/?${new URLSearchParams(params).toString()}`, "_blank", "noopener");
      });
    };
    document.documentElement.append(root);
  }

  let attempts = 0;
  const waitForProfile = () => {
    void mountProfileEmbed(); mountLeaderboardImporter(); mountFomoTokenHolderSync();
    attempts += 1;
    if (!document.querySelector("#follower-alpha-inline") && attempts < 15) setTimeout(waitForProfile, 600);
  };
  setTimeout(waitForProfile, 700);
  if (isFomo) setInterval(() => { mountLeaderboardImporter(); mountFomoTokenHolderSync(); }, 2500);
  document.addEventListener("mouseup", () => setTimeout(mountThesisCapture, 0));
})();
