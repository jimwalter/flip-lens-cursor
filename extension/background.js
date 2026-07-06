// FlipLens background service worker (ES module).
// - Routes the trigger (toolbar icon or shortcut) to the selection overlay.
// - Captures + crops the chosen region in-memory and hands it to the uploader.
// - Tracks the search tab so the results scraper can attach a title + price.
// - Exposes app state (session/plan/settings) and the history API to the UI.
//
// Commercial seams (auth, entitlements, sync, analytics, config) live in ./src
// and are wired here. Everything defaults to local + unlocked so the product is
// testable with no account and no backend.

import { CONFIG } from "./src/config.js";
import { getSession } from "./src/auth.js";
import { resolveEntitlements, quotaView } from "./src/entitlements.js";
import { getSettings, setSettings } from "./src/settings.js";
import { track } from "./src/analytics.js";
import * as store from "./src/history-store.js";
import * as quota from "./src/quota.js";
import * as account from "./src/account.js";

const INJECTABLE = /^https?:\/\//;
const PENDING_KEY = "flip_pending"; // { [tabId]: captureId }

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener((tab) => {
  openPanel(tab && tab.windowId);
  startCapture(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "start-capture") return;
  openPanel(tab && tab.windowId);
  startCapture(tab);
});

function openPanel(windowId) {
  try {
    if (windowId != null) chrome.sidePanel.open({ windowId });
  } catch (err) {
    console.debug("FlipLens: sidePanel.open skipped", err);
  }
}

async function startCapture(tab) {
  if (!tab || !tab.id) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }

  // Gate: require a verified email and remaining trial scans before capturing.
  // If blocked, open the sidebar (which shows the right screen) instead.
  const gate = await evaluateGate();
  if (!gate.allowed) {
    openPanel(tab && tab.windowId);
    notifyPanel();
    return;
  }

  if (!tab || !tab.id || !INJECTABLE.test(tab.url || "")) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["overlay.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["overlay.js"] });
  } catch (err) {
    console.error("FlipLens: failed to start capture", err);
  }
}

// Decide whether a capture may proceed. Returns { allowed, view }.
async function evaluateGate() {
  const acct = await account.getAccount();
  if (!acct) return { allowed: false, view: "email" };
  if (acct.status !== "active") return { allowed: false, view: "verify" };
  const q = await quotaView();
  if (!q.unlimited && q.remaining <= 0) return { allowed: false, view: "paywall" };
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message && message.type;

  if (type === "FLIPLENS_SELECTION") {
    handleSelection(message.rect, sender.tab)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("FlipLens: selection handling failed", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  if (type === "FLIPLENS_IS_PENDING") {
    getPending().then((pending) => {
      const tabId = sender.tab && sender.tab.id;
      sendResponse({ pending: tabId != null && pending[tabId] != null, cid: pending[tabId] });
    });
    return true;
  }

  if (type === "FLIPLENS_RESULT") {
    handleResult(message, sender.tab).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === "FLIPLENS_GET_STATE") {
    getState().then((state) => sendResponse(state));
    return true;
  }

  if (type === "FLIPLENS_SET_SETTINGS") {
    setSettings(message.patch || {}).then(async () => {
      notifyPanel();
      sendResponse(await getState());
    });
    return true;
  }

  if (type === "FLIPLENS_REGISTER_EMAIL") {
    account.registerEmail(message.email, message.marketingOptIn).then(async (res) => {
      notifyPanel();
      sendResponse({ ...res, state: await getState() });
    });
    return true;
  }

  if (type === "FLIPLENS_VERIFY") {
    account.verify(message.code).then(async (res) => {
      notifyPanel();
      if (res.ok) track("account_verified");
      sendResponse({ ...res, state: await getState() });
    });
    return true;
  }

  if (type === "FLIPLENS_RESEND") {
    account.resend().then((res) => sendResponse(res));
    return true;
  }

  if (type === "FLIPLENS_UPGRADE") {
    handleUpgrade().then(async (res) => {
      notifyPanel();
      sendResponse({ ...res, state: await getState() });
    });
    return true;
  }

  if (type === "FLIPLENS_DEV_RESET") {
    Promise.all([account.reset(), quota.reset()]).then(async () => {
      notifyPanel();
      sendResponse({ ok: true, state: await getState() });
    });
    return true;
  }

  if (type === "FLIPLENS_GET_HISTORY") {
    store.getHistory().then((history) => sendResponse({ history }));
    return true;
  }

  if (type === "FLIPLENS_RENAME") {
    store.updateEntry(message.cid, { title: message.title, titleAuto: false }).then(() => {
      notifyPanel();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (type === "FLIPLENS_DELETE") {
    store.deleteEntry(message.cid).then(() => {
      notifyPanel();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (type === "FLIPLENS_CLEAR") {
    store.clearHistory().then(() => {
      notifyPanel();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (type === "FLIPLENS_OPEN") {
    if (message.url) chrome.tabs.create({ url: message.url });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pending = await getPending();
  if (pending[tabId] != null) {
    const cid = pending[tabId];
    delete pending[tabId];
    await setPending(pending);
    await store.updateEntry(cid, { status: "done" });
    notifyPanel();
  }
});

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

async function getState() {
  const [session, entitlements, settings, acct, quotaInfo] = await Promise.all([
    getSession(),
    resolveEntitlements(),
    getSettings(),
    account.getAccount(),
    quotaView()
  ]);
  return {
    env: CONFIG.env,
    version: CONFIG.version,
    flags: CONFIG.flags,
    session: { id: session.id, type: session.type },
    account: account.publicView(acct),
    quota: {
      used: quotaInfo.used,
      limit: quotaInfo.limit,
      unlimited: quotaInfo.unlimited,
      remaining: quotaInfo.unlimited ? null : quotaInfo.remaining
    },
    entitlements,
    settings
  };
}

async function handleUpgrade() {
  if (CONFIG.flags.billing && CONFIG.checkoutUrl) {
    chrome.tabs.create({ url: CONFIG.checkoutUrl });
    return { ok: true, checkout: true };
  }
  // Dev: simulate a successful purchase so the unlocked state is testable.
  await account.simulatePurchase();
  return { ok: true, simulated: true };
}

// ---------------------------------------------------------------------------
// Capture + search
// ---------------------------------------------------------------------------

async function handleSelection(rect, tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const full = await cropImage(dataUrl, rect);
  const thumbnail = await makeThumbnail(full, 240);
  const cid = crypto.randomUUID();
  const session = await getSession();

  await store.addEntry({
    id: cid,
    userId: session.id,
    createdAt: Date.now(),
    thumbnail,
    title: "",
    titleAuto: true,
    priceMin: null,
    priceMax: null,
    priceMinUrl: "",
    priceMaxUrl: "",
    currency: "",
    sourcePageUrl: tab.url || "",
    searchUrl: "",
    status: "searching"
  });
  await quota.increment();
  notifyPanel();
  track("capture_completed");

  await chrome.storage.session.set({ [`img_${cid}`]: full });

  const searchTab = await chrome.tabs.create({
    url: chrome.runtime.getURL(`uploader.html?cid=${cid}`)
  });

  const pending = await getPending();
  pending[searchTab.id] = cid;
  await setPending(pending);
}

async function handleResult(message, tab) {
  const { cid } = message;
  if (!cid) return;

  const entry = await store.getEntry(cid);
  if (!entry) return;

  const patch = {
    priceMin: message.priceMin ?? null,
    priceMax: message.priceMax ?? null,
    priceMinUrl: message.priceMinUrl || "",
    priceMaxUrl: message.priceMaxUrl || "",
    currency: message.currency || "",
    searchUrl: message.searchUrl || "",
    status: "done"
  };
  // Don't clobber a title the user renamed; keep updating auto titles
  // (including when a Lens re-crop re-searches).
  if (entry.titleAuto !== false && message.title) patch.title = message.title;

  await store.updateEntry(cid, patch);
  notifyPanel();

  const pending = await getPending();
  const tabId = tab && tab.id;
  if (tabId != null && pending[tabId] != null) {
    delete pending[tabId];
    await setPending(pending);
  }
}

// ---------------------------------------------------------------------------
// Image helpers (OffscreenCanvas is available in the service worker)
// ---------------------------------------------------------------------------

async function cropImage(dataUrl, rect) {
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
  const dpr = rect.dpr || 1;
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.max(1, Math.round(rect.width * dpr));
  const sh = Math.max(1, Math.round(rect.height * dpr));

  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return await blobToDataUrl(blob);
}

async function makeThumbnail(dataUrl, maxDim) {
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return await blobToDataUrl(blob);
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/:(.*?);/) || [null, "image/png"])[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

// ---------------------------------------------------------------------------
// Pending-tab storage
// ---------------------------------------------------------------------------

async function getPending() {
  const { [PENDING_KEY]: pending } = await chrome.storage.session.get(PENDING_KEY);
  return pending && typeof pending === "object" ? pending : {};
}

async function setPending(pending) {
  await chrome.storage.session.set({ [PENDING_KEY]: pending });
}

function notifyPanel() {
  chrome.runtime.sendMessage({ type: "FLIPLENS_HISTORY_UPDATED" }).catch(() => {});
}
