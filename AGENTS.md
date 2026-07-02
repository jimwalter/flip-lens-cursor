# AGENTS.md

## Cursor Cloud specific instructions

- **What this is:** `flip-lens-cursor` is a Chrome **Manifest V3** extension (**FlipLens**) living entirely in `extension/`. See `README.md` for the user flow and `PRODUCT_SPEC.md` for the spec.
- **No build, no dependencies:** there is no package manager, bundler, or lockfile. The source in `extension/` loads directly. There is nothing to install and no update/build step to run.
- **Load & test (manual):** at `chrome://extensions` enable Developer mode → **Load unpacked** → select `/workspace/extension`. Trigger via the toolbar icon or `Ctrl+Shift+Y` (`Cmd+Shift+Y` on macOS). After editing files, click the reload (↻) icon on the FlipLens card to pick up changes.
- **Architecture:** `background.js` (service worker) routes the trigger, calls `chrome.tabs.captureVisibleTab`, and crops the region with `OffscreenCanvas` scaled by `devicePixelRatio`; `overlay.js`/`overlay.css` is the injected drag-to-select UI; the cropped image is passed in-memory via `chrome.storage.session` to `uploader.html`/`uploader.js`.
- **Google Lens hand-off (non-obvious):** Lens is invoked by a real `<form>` POST of `encoded_image` to `https://lens.google.com/v3/upload` from the uploader tab — a plain `fetch()` to Lens is blocked by Google, so it must be a form submit that navigates the tab. This is isolated in `uploader.js`; if Google changes the endpoint, fix it there (fallback: Google Images `searchbyimage/upload`).
- **Constraints:** the overlay only injects on `http(s)` pages (Chrome blocks `chrome://` and the Web Store). `captureVisibleTab` only grabs the visible viewport, so the item must be on-screen when selecting. The design is intentionally disk-free — do not add `chrome.downloads`.
- **Testing note:** end-to-end verification requires the Chrome GUI (load unpacked → capture → confirm a Google Lens results tab opens); there is no headless/automated test harness in this repo.
