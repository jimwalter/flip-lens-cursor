// FlipLens background service worker.
// - Routes the trigger (toolbar icon or shortcut) to the selection overlay.
// - Captures + crops the chosen region in-memory and hands it to the uploader.
// - Tracks the search tab so the results scraper can attach a title + price.
// - Owns the persisted search history used by the side panel.

const INJECTABLE = /^https?:\/\//;
const HISTORY_KEY = "flip_history";
const PENDING_KEY = "flip_pending"; // { [tabId]: captureId }
const MAX_HISTORY = 100;

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
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
    // Opening the panel may be rejected outside a user gesture; capture still works.
    console.debug("FlipLens: sidePanel.open skipped", err);
  }
}

async function startCapture(tab) {
  if (!tab || !tab.id) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  if (!tab || !tab.id || !INJECTABLE.test(tab.url || "")) {
    return; // can't inject into chrome://, the Web Store, etc.
  }
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["overlay.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["overlay.js"] });
  } catch (err) {
    console.error("FlipLens: failed to start capture", err);
  }
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

  if (type === "FLIPLENS_GET_HISTORY") {
    getHistory().then((history) => sendResponse({ history }));
    return true;
  }

  if (type === "FLIPLENS_RENAME") {
    updateEntry(message.cid, { title: message.title, titleAuto: false }).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (type === "FLIPLENS_DELETE") {
    deleteEntry(message.cid).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === "FLIPLENS_CLEAR") {
    setHistory([]).then(() => {
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

// A pending search tab was closed before results came back: stop its spinner.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pending = await getPending();
  if (pending[tabId] != null) {
    const cid = pending[tabId];
    delete pending[tabId];
    await setPending(pending);
    await updateEntry(cid, { status: "done" });
  }
});

// ---------------------------------------------------------------------------
// Capture + search
// ---------------------------------------------------------------------------

async function handleSelection(rect, tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const full = await cropImage(dataUrl, rect);
  const thumbnail = await makeThumbnail(full, 240);
  const cid = crypto.randomUUID();

  await prependEntry({
    id: cid,
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

  const history = await getHistory();
  const entry = history.find((e) => e.id === cid);
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
  // Don't clobber a title the user has renamed; keep updating auto titles
  // (including when a Lens re-crop re-searches).
  if (entry.titleAuto !== false && message.title) patch.title = message.title;

  await updateEntry(cid, patch);

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
// History + pending-tab storage
// ---------------------------------------------------------------------------

async function getHistory() {
  const { [HISTORY_KEY]: history } = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(history) ? history : [];
}

async function setHistory(history) {
  await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, MAX_HISTORY) });
}

async function prependEntry(entry) {
  const history = await getHistory();
  history.unshift(entry);
  await setHistory(history);
  notifyPanel();
}

async function updateEntry(cid, patch) {
  const history = await getHistory();
  const idx = history.findIndex((e) => e.id === cid);
  if (idx === -1) return;
  history[idx] = { ...history[idx], ...patch };
  await setHistory(history);
  notifyPanel();
}

async function deleteEntry(cid) {
  const history = await getHistory();
  await setHistory(history.filter((e) => e.id !== cid));
  notifyPanel();
}

async function getPending() {
  const { [PENDING_KEY]: pending } = await chrome.storage.session.get(PENDING_KEY);
  return pending && typeof pending === "object" ? pending : {};
}

async function setPending(pending) {
  await chrome.storage.session.set({ [PENDING_KEY]: pending });
}

function notifyPanel() {
  // Best-effort ping; ignored if the panel isn't open.
  chrome.runtime.sendMessage({ type: "FLIPLENS_HISTORY_UPDATED" }).catch(() => {});
}
