// FlipLens results scraper.
// Runs on Google Lens / Google results pages. If the background worker says
// this tab belongs to a FlipLens capture, it best-effort extracts a title and a
// price range from the visible results and reports them back for the history.
// It never blocks or alters the page; failures degrade to "no data".

(() => {
  if (window.__flipLensResultsRan) return;
  window.__flipLensResultsRan = true;

  // Skip the intermediate upload endpoint; only scrape rendered result pages.
  if (location.pathname.includes("/upload")) return;

  const PRICE_RX = /(?:US\$|USD\s?|CA\$|AU\$|[$£€])\s?(\d{1,3}(?:[,\s]?\d{3})*(?:\.\d{1,2})?)/g;
  const CURRENCY_RX = /US\$|USD|CA\$|AU\$|[$£€]/;
  const MAX_ATTEMPTS = 14;
  const INTERVAL_MS = 700;

  chrome.runtime.sendMessage({ type: "FLIPLENS_IS_PENDING" }).then((info) => {
    if (!info || !info.pending) return;
    poll(info.cid, 0);
  }).catch(() => {});

  function poll(cid, attempt) {
    const data = scrape();
    const done = data.priceMin != null || attempt >= MAX_ATTEMPTS - 1;
    if (done) {
      chrome.runtime.sendMessage({
        type: "FLIPLENS_RESULT",
        cid,
        title: data.title,
        priceMin: data.priceMin,
        priceMax: data.priceMax,
        currency: data.currency,
        searchUrl: location.href
      }).catch(() => {});
      return;
    }
    setTimeout(() => poll(cid, attempt + 1), INTERVAL_MS);
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
    const text = document.body ? document.body.innerText : "";
    const values = [];
    let currency = "";
    let match;
    PRICE_RX.lastIndex = 0;
    while ((match = PRICE_RX.exec(text)) !== null) {
      const num = parseFloat(match[1].replace(/[,\s]/g, ""));
      if (!isNaN(num) && num > 0 && num < 10000000) {
        values.push(num);
        if (!currency) {
          const sym = match[0].match(CURRENCY_RX);
          if (sym) currency = sym[0];
        }
      }
    }
    if (!values.length) return { priceMin: null, priceMax: null, currency: "" };
    values.sort((a, b) => a - b);
    // Trim extreme outliers (a single mis-parsed value shouldn't blow up the range).
    const lo = values[Math.floor(values.length * 0.05)];
    const hi = values[Math.ceil(values.length * 0.95) - 1] ?? values[values.length - 1];
    return { priceMin: lo, priceMax: hi, currency };
  }

  function textOf(el) {
    return el ? el.textContent : "";
  }
  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }
})();
