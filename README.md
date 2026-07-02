# flip-lens-cursor

**FlipLens** — a Chrome (Manifest V3) extension for resellers/flippers. Drag-select
any item on a webpage, capture it **in memory**, and instantly run a **Google Lens**
reverse-image search in a new tab. Nothing is ever saved to disk.

See [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) for the full product spec and feature request.

## How it works

1. On any page, click the **FlipLens** toolbar icon **or** press `Ctrl+Shift+Y`
   (`Cmd+Shift+Y` on macOS).
2. A dimmed overlay appears — drag a box around the item (`Esc` cancels).
3. The selected region is captured in memory and a new tab opens, auto-submitting
   the image to Google Lens. Results appear immediately; your original tab is untouched.

## Load the extension (development)

This is a plain MV3 extension with **no build step and no dependencies** — the source
in [`extension/`](./extension) loads directly.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `extension/` folder.
4. (Optional) Pin FlipLens to the toolbar via the puzzle-piece menu.
5. Remap the shortcut at `chrome://extensions/shortcuts` if desired.

## Project layout

```
extension/
  manifest.json     MV3 manifest (permissions, action, command shortcut)
  background.js     service worker: trigger routing, capture + crop (OffscreenCanvas)
  overlay.js/.css   injected drag-to-select overlay
  uploader.html/.js new tab that POSTs the image to Google Lens
  icons/            toolbar icons
```

## Notes

- Works on normal `http(s)` pages; Chrome blocks extensions on `chrome://` pages and
  the Chrome Web Store.
- The Google Lens hand-off is isolated in `uploader.js`; if Google changes the upload
  endpoint it is a one-line fix (fallback: Google Images `searchbyimage/upload`).
