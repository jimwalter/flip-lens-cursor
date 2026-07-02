// FlipLens results scraper.
// Runs on Google Lens / Google results pages. If the background worker says this
// tab belongs to a FlipLens capture, it best-effort extracts a title and a price
// range (with a source link for the low and the high) and reports them back for
// the history. It keeps watching the page so that re-cropping the Lens selection
// (which re-searches) updates the same history entry. It never blocks or alters
// the page; failures degrade to "no data".

(() => {
  if (window.__flipLensResultsRan) return;
  window.__flipLensResultsRan = true;

  // Skip the intermediate upload endpoint; only scrape rendered result pages.
  if (location.pathname.includes("/upload")) return;

  const PRICE_RX = /(?:US\$|USD\s?|CA\$|AU\$|[$£€])\s?(\d{1,3}(?:[,\s]?\d{3})*(?:\.\d{1,2})?)/;
  const CURRENCY_RX = /US\$|USD|CA\$|AU\$|[$£€]/;

  let cid = null;
  let lastSig = "";
  let dirty = true;

  chrome.runtime
    .sendMessage({ type: "FLIPLENS_IS_PENDING" })
    .then((info) => {
      if (!info || !info.pending) return;
      cid = info.cid;
      watch();
    })
    .catch(() => {});

  function watch() {
    // Re-searching (dragging the Lens crop box) mutates the DOM and usually the
    // URL. Mark dirty on either, and re-report on a throttled interval so a busy
    // page can't starve us and we don't spam identical updates.
    const observer = new MutationObserver(() => {
      dirty = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        reportIfChanged();
      }
    }, 1200);
  }

  function reportIfChanged() {
    if (!cid) return;
    const data = scrape();
    if (!data.title && data.priceMin == null) return; // nothing useful yet

    const sig = [
      data.title,
      data.priceMin,
      data.priceMax,
      data.priceMinUrl,
      data.priceMaxUrl,
      location.href
    ].join("|");
    if (sig === lastSig) return;
    lastSig = sig;

    chrome.runtime
      .sendMessage({ type: "FLIPLENS_RESULT", cid, ...data, searchUrl: location.href })
      .catch(() => {});
  }

  function scrape() {
    return { title: scrapeTitle(), ...scrapePrices() };
  }

  function scrapeTitle() {
    const meta = document.querySelector('meta[property="og:title"]');
    const candidates = [
      meta && meta.content,
      textOf(document.querySelector("a h3")),
      textOf(document.querySelector('[role="heading"][aria-level="2"]')),
      textOf(document.querySelector("h1")),
      (document.title || "").replace(/\s*[-–]\s*Google.*$/i, "").replace(/Google Lens/i, "").trim()
    ];
    for (const c of candidates) {
      const t = clean(c);
      if (t && t.length >= 3 && !/^search/i.test(t)) return t.slice(0, 90);
    }
    return "";
  }

  function scrapePrices() {
    // Collect every priced result together with the URL of its nearest link, so
    // the low and the high each carry a source we can link to.
    const items = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || !CURRENCY_RX.test(text)) continue;
      const m = text.match(PRICE_RX);
      if (!m) continue;
      const num = parseFloat(m[1].replace(/[,\s]/g, ""));
      if (isNaN(num) || num <= 0 || num >= 1e7) continue;
      const anchor = closestAnchor(node.parentElement);
      const sym = (m[0].match(CURRENCY_RX) || [""])[0];
      items.push({ price: num, url: anchor ? unwrap(anchor.href) : "", currency: sym });
    }

    if (!items.length) {
      return { priceMin: null, priceMax: null, priceMinUrl: "", priceMaxUrl: "", currency: "" };
    }

    items.sort((a, b) => a.price - b.price);
    // Trim extreme outliers so one mis-parsed value doesn't blow up the range.
    const lo = items[Math.floor(items.length * 0.05)];
    const hi = items[Math.ceil(items.length * 0.95) - 1] || items[items.length - 1];

    return {
      priceMin: lo.price,
      priceMax: hi.price,
      priceMinUrl: lo.url,
      priceMaxUrl: hi.url,
      currency: lo.currency || hi.currency
    };
  }

  function closestAnchor(el) {
    while (el) {
      if (el.tagName === "A" && el.href) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Google often wraps outbound links as /url?q=... — unwrap to the real target.
  function unwrap(href) {
    try {
      const u = new URL(href, location.href);
      if (/(^|\.)google\./.test(u.hostname)) {
        const real = u.searchParams.get("url") || u.searchParams.get("q");
        if (real && /^https?:/.test(real)) return real;
      }
      return u.href;
    } catch (e) {
      return href;
    }
  }

  function textOf(el) {
    return el ? el.textContent : "";
  }
  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }
})();
