// FlipLens background service worker.
// Routes the trigger (toolbar icon or keyboard shortcut) to the selection
// overlay, captures + crops the chosen region in-memory, and hands it off to
// the uploader tab which submits it to Google Lens.

const INJECTABLE = /^https?:\/\//;

async function startCapture(tab) {
  if (!tab || !tab.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab || !tab.id || !INJECTABLE.test(tab.url || "")) {
    // Can't inject into chrome://, the Web Store, or other privileged pages.
    return;
  }
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["overlay.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["overlay.js"] });
  } catch (err) {
    console.error("FlipLens: failed to start capture", err);
  }
}

chrome.action.onClicked.addListener((tab) => startCapture(tab));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "start-capture") startCapture(tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "FLIPLENS_SELECTION") {
    handleSelection(message.rect, sender.tab)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("FlipLens: selection handling failed", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // keep the message channel open for the async response
  }
});

async function handleSelection(rect, tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const cropped = await cropImage(dataUrl, rect);
  await chrome.storage.session.set({ flipLensImage: cropped });
  await chrome.tabs.create({ url: chrome.runtime.getURL("uploader.html") });
}

async function cropImage(dataUrl, rect) {
  const blob = dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const dpr = rect.dpr || 1;
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.max(1, Math.round(rect.width * dpr));
  const sh = Math.max(1, Math.round(rect.height * dpr));

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  const outBlob = await canvas.convertToBlob({ type: "image/png" });
  return await blobToDataUrl(outBlob);
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
