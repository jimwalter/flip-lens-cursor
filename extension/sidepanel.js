// FlipLens side panel.
// Shows the signup/verify gate until the user has a verified email, then the
// trial meter + history, and a paywall once the free scans run out. Plan/quota
// state comes from the background worker via messages.

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const gateEl = document.getElementById("gate");
const appEl = document.getElementById("app");
const trialEl = document.getElementById("trial");
const paywallEl = document.getElementById("paywall");
const planBadge = document.getElementById("plan-badge");
const exportBtn = document.getElementById("export");
const clearBtn = document.getElementById("clear");

let appState = null;

document.getElementById("collapse").addEventListener("click", () => window.close());
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
clearBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "FLIPLENS_CLEAR" }));
exportBtn.addEventListener("click", exportHistory);
document.getElementById("paywall-upgrade").addEventListener("click", upgrade);

chrome.commands.getAll().then((cmds) => {
  const c = cmds.find((x) => x.name === "start-capture");
  if (c && c.shortcut) document.getElementById("shortcut-hint").textContent = c.shortcut;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "FLIPLENS_HISTORY_UPDATED") render();
});

render();

async function render() {
  appState = await chrome.runtime.sendMessage({ type: "FLIPLENS_GET_STATE" });
  applyState();

  const account = appState && appState.account;
  const active = account && account.status === "active";

  if (!active) {
    appEl.hidden = true;
    gateEl.hidden = false;
    exportBtn.hidden = true;
    clearBtn.hidden = true;
    renderGate(account ? "verify" : "email");
    return;
  }

  gateEl.hidden = true;
  appEl.hidden = false;
  exportBtn.hidden = false;
  clearBtn.hidden = false;
  renderTrial();

  const { history } = await chrome.runtime.sendMessage({ type: "FLIPLENS_GET_HISTORY" });
  const items = history || [];
  emptyEl.hidden = items.length > 0;
  listEl.innerHTML = "";
  for (const entry of items) listEl.appendChild(renderCard(entry));
}

// ---------------------------------------------------------------------------
// Signup / verification gate
// ---------------------------------------------------------------------------

function renderGate(view) {
  gateEl.innerHTML = "";
  gateEl.appendChild(view === "verify" ? verifyView() : emailView());
}

function emailView() {
  const wrap = el("div", "gate-card");
  wrap.appendChild(el("h2", "gate-title", "Create your free account"));
  wrap.appendChild(el("p", "gate-sub", "Verify your email to unlock 10 free scans."));

  const input = document.createElement("input");
  input.type = "email";
  input.className = "gate-input";
  input.placeholder = "you@example.com";
  input.autocomplete = "email";
  wrap.appendChild(input);

  const consent = document.createElement("label");
  consent.className = "gate-consent";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  consent.appendChild(cb);
  consent.appendChild(document.createTextNode(" Email me product news & partnership offers (optional)"));
  wrap.appendChild(consent);

  const err = el("p", "gate-error");
  err.hidden = true;
  wrap.appendChild(err);

  const btn = el("button", "btn-primary", "Send verification code");
  wrap.appendChild(btn);

  wrap.appendChild(
    el("p", "gate-note", "We only use your email for verification and account updates. Captured images are never uploaded to FlipLens.")
  );

  const submit = async () => {
    err.hidden = true;
    const email = input.value.trim();
    if (!email) {
      showError(err, "Please enter your email.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Sending…";
    const res = await chrome.runtime.sendMessage({
      type: "FLIPLENS_REGISTER_EMAIL",
      email,
      marketingOptIn: cb.checked
    });
    if (!res.ok) {
      showError(err, res.error || "Something went wrong.");
      btn.disabled = false;
      btn.textContent = "Send verification code";
      return;
    }
    render();
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  return wrap;
}

function verifyView() {
  const account = appState.account;
  const wrap = el("div", "gate-card");
  wrap.appendChild(el("h2", "gate-title", "Check your email"));
  wrap.appendChild(el("p", "gate-sub", `Enter the 6-digit code we sent to ${account.email}.`));

  if (account.devCode) {
    const hint = el("p", "gate-devcode", `Dev mode — your code is ${account.devCode}`);
    wrap.appendChild(hint);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.maxLength = 6;
  input.className = "gate-input gate-code";
  input.placeholder = "123456";
  wrap.appendChild(input);

  const err = el("p", "gate-error");
  err.hidden = true;
  wrap.appendChild(err);

  const btn = el("button", "btn-primary", "Verify & start");
  wrap.appendChild(btn);

  const links = el("div", "gate-links");
  const resend = el("button", "link", "Resend code");
  const change = el("button", "link", "Change email");
  links.appendChild(resend);
  links.appendChild(change);
  wrap.appendChild(links);

  const submit = async () => {
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Verifying…";
    const res = await chrome.runtime.sendMessage({ type: "FLIPLENS_VERIFY", code: input.value });
    if (!res.ok) {
      showError(err, res.error || "Verification failed.");
      btn.disabled = false;
      btn.textContent = "Verify & start";
      return;
    }
    render();
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  resend.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "FLIPLENS_RESEND" });
    render();
  });
  change.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "FLIPLENS_DEV_RESET" });
    render();
  });
  return wrap;
}

// ---------------------------------------------------------------------------
// Trial meter + paywall
// ---------------------------------------------------------------------------

function renderTrial() {
  const q = appState.quota || {};
  trialEl.hidden = false;
  trialEl.innerHTML = "";

  if (q.unlimited) {
    paywallEl.hidden = true;
    const badge = el("div", "trial-pro", "Pro — unlimited scans");
    trialEl.appendChild(badge);
    return;
  }

  const used = q.used || 0;
  const limit = q.limit || 0;
  const remaining = Math.max(0, limit - used);

  const label = el("div", "trial-label", `${used} / ${limit} free scans used`);
  trialEl.appendChild(label);

  const bar = el("div", "trial-bar");
  const fill = el("div", "trial-fill");
  fill.style.width = `${limit ? Math.min(100, (used / limit) * 100) : 0}%`;
  if (remaining <= 2) fill.classList.add("low");
  bar.appendChild(fill);
  trialEl.appendChild(bar);

  paywallEl.hidden = remaining > 0;
}

async function upgrade() {
  const res = await chrome.runtime.sendMessage({ type: "FLIPLENS_UPGRADE" });
  if (res && res.simulated) {
    // Dev: purchase simulated; state refresh will unlock the UI.
  }
  render();
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function renderCard(entry) {
  const li = document.createElement("li");
  li.className = "card";

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = entry.thumbnail;
  thumb.alt = entry.title || "capture";
  thumb.title = "Open the Google Lens results";
  thumb.addEventListener("click", () => openSearch(entry));
  li.appendChild(thumb);

  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "title";
  if (entry.status === "searching" && !entry.title) {
    title.classList.add("searching");
    title.textContent = "Searching…";
    const spin = document.createElement("span");
    spin.className = "spinner";
    title.prepend(spin);
  } else {
    title.contentEditable = "true";
    title.spellcheck = false;
    title.textContent = entry.title || "Untitled capture";
    title.title = "Click to rename";
    title.addEventListener("blur", () =>
      chrome.runtime.sendMessage({ type: "FLIPLENS_RENAME", cid: entry.id, title: title.textContent.trim() })
    );
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        title.blur();
      }
    });
  }
  body.appendChild(title);

  const price = document.createElement("div");
  if (entry.priceMin != null) {
    price.className = "price";
    price.appendChild(priceNode(entry.priceMin, entry.currency, entry.priceMinUrl, "Open lowest-price listing"));
    if (entry.priceMax !== entry.priceMin) {
      price.appendChild(document.createTextNode(" – "));
      price.appendChild(priceNode(entry.priceMax, entry.currency, entry.priceMaxUrl, "Open highest-price listing"));
    }
  } else {
    price.className = "price unknown";
    price.textContent = entry.status === "searching" ? "Estimating price…" : "No price found";
  }
  body.appendChild(price);

  if (entry.sourcePageUrl) {
    const source = el("div", "source");
    const link = el("button", "link source-link", `From ${hostname(entry.sourcePageUrl)}`);
    link.title = entry.sourcePageUrl;
    link.addEventListener("click", () =>
      chrome.runtime.sendMessage({ type: "FLIPLENS_OPEN", url: entry.sourcePageUrl })
    );
    source.appendChild(link);
    body.appendChild(source);
  }

  const meta = el("div", "meta");
  meta.appendChild(el("span", "time", relativeTime(entry.createdAt)));

  const actions = el("div", "row-actions");
  const open = el("button", "link", "Open");
  open.addEventListener("click", () => openSearch(entry));
  actions.appendChild(open);
  const del = el("button", "link danger", "Delete");
  del.addEventListener("click", () => chrome.runtime.sendMessage({ type: "FLIPLENS_DELETE", cid: entry.id }));
  actions.appendChild(del);
  meta.appendChild(actions);

  body.appendChild(meta);
  li.appendChild(body);
  return li;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyState() {
  if (!appState || !appState.entitlements) return;
  const ent = appState.entitlements;
  planBadge.textContent = ent.label;
  planBadge.hidden = false;
  planBadge.classList.toggle("pro", ent.planId === "pro");
  exportBtn.title = ent.limits.export ? "Export history as JSON" : "Export is a Pro feature";
  exportBtn.classList.toggle("locked", !ent.limits.export);
}

async function exportHistory() {
  if (appState && appState.entitlements && !appState.entitlements.limits.export) {
    alert("Exporting history is a Pro feature. Upgrade to Pro to export your history.");
    return;
  }
  const { history } = await chrome.runtime.sendMessage({ type: "FLIPLENS_GET_HISTORY" });
  const blob = new Blob([JSON.stringify(history || [], null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fliplens-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function openSearch(entry) {
  if (entry.searchUrl) chrome.runtime.sendMessage({ type: "FLIPLENS_OPEN", url: entry.searchUrl });
}

function priceNode(value, currency, url, title) {
  const sym = currency || "$";
  const label = sym + Math.round(value).toLocaleString();
  if (url && /^https?:/.test(url)) {
    const a = el("button", "price-link", label);
    a.title = title;
    a.addEventListener("click", () => chrome.runtime.sendMessage({ type: "FLIPLENS_OPEN", url }));
    return a;
  }
  const span = document.createElement("span");
  span.textContent = label;
  return span;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "source";
  }
}

function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function showError(node, msg) {
  node.textContent = msg;
  node.hidden = false;
}
