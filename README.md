# flip-lens-cursor

**FlipLens** — a Chrome (Manifest V3) extension for resellers/flippers. Drag-select
any item on a webpage, capture it **in memory**, and instantly run a **Google Lens**
reverse-image search in a new tab. Nothing is ever saved to disk.

See [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) for the full product spec and feature request,
and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how it's structured and made
commercial-ready (auth/plans/sync/analytics seams) while staying testable with no account.

## How it works

1. On any page, click the **FlipLens** toolbar icon **or** press `Ctrl+Shift+Y`
   (`Cmd+Shift+Y` on macOS). This also opens the FlipLens **sidebar**.
2. A dimmed overlay appears — drag a box around the item (`Esc` cancels).
3. The selected region is captured in memory and a new tab opens, auto-submitting
   the image to Google Lens. Results appear immediately; your original tab is untouched.
4. The capture is added to the **sidebar history** with a thumbnail. Once Lens loads,
   an auto **title** and an estimated **price range** (from the listing prices in the
   results) are filled in. Titles are editable — click to rename. The sidebar stays
   open while you browse; click **×** to collapse it.

## Sidebar

- Opens when you trigger a capture (icon or shortcut) and stays open across navigation.
- Each entry shows the thumbnail, an editable auto-title, an estimated price range,
  a link back to the original page, and a relative timestamp. Click a thumbnail or
  **Open** to re-open its Lens results.
- The **low** and **high** of the price range are each links to the listing they came
  from. **From &lt;site&gt;** re-opens the page you captured from.
- If you adjust the Lens crop box on the results page, it re-searches and the sidebar
  entry (title + price range) updates automatically for that item.
- **Delete** removes one entry; **Clear** wipes the history. History persists locally
  (thumbnails only — full captures are never written to disk).

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
  manifest.json      MV3 manifest (permissions, action, side panel, options, command)
  background.js      module service worker: trigger routing, capture + crop, app state
  overlay.js/.css    injected drag-to-select overlay
  uploader.html/.js  new tab that POSTs the image to Google Lens
  results.js         content script: scrapes title + price range from Lens results
  sidepanel.html/.css/.js  the history sidebar (plan badge, export, settings)
  options.html/.css/.js    settings/account page (+ dev plan simulator)
  src/               commercial seams (config, auth, entitlements, api, analytics,
                     settings, history-store) — local + unlocked by default
  icons/             toolbar icons
```

## Accounts & free trial

FlipLens requires a **verified email**, then gives **10 free scans** before asking you
to upgrade to Pro:

1. First run, the sidebar asks for your email (+ optional marketing consent) and sends a
   6-digit code. *(In development the code is shown on-screen — no real email is sent.)*
2. Enter the code to activate; you get **10 free scans** with a trial meter.
3. When the trial runs out, a paywall offers **Pro** (unlimited scans, history sync, export).

Email is **normalized** (Gmail dots/`+aliases` collapse to one account; disposable domains
blocked) to keep the free trial fair. Real email/verification and enforced quota require the
backend (see below) — the extension ships with a local mock so the flow is testable now.

## Commercial-readiness (no payment/auth built yet)

FlipLens is structured so it can become a paid product later without a rewrite:

- Signup/verify/trial/convert flow wired to backend seams (`src/account.js`, `src/quota.js`),
  running on a **local mock** in development.
- A single **entitlements** layer (`src/entitlements.js`) gates features by plan; use
  **Settings → Simulate plan** to preview Free vs Pro, or the paywall's Upgrade to simulate a purchase.
- **Backend/auth/sync/analytics** are abstractions (`src/api.js`, `src/auth.js`, `src/analytics.js`)
  that are no-ops until you set endpoints + flip flags in `src/config.js`.
- See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the gate flow, the **backend contract**, and
  the go-live checklist.

## Notes

- Works on normal `http(s)` pages; Chrome blocks extensions on `chrome://` pages and
  the Chrome Web Store.
- The Google Lens hand-off is isolated in `uploader.js`; if Google changes the upload
  endpoint it is a one-line fix (fallback: Google Images `searchbyimage/upload`).
