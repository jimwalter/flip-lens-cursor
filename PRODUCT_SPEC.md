# FlipLens — Product Spec & Feature Request

## 1. One-liner
A Chrome (Manifest V3) extension that lets a reseller drag-select any item on a webpage, capture it in-memory, and instantly run a Google Lens reverse-image search in a new tab — no file ever saved to disk.

## 2. Problem
Flippers (estate sales, furniture, watches, lamps) currently: screenshot an item → open a new tab → open Google Lens → drag the screenshot in before it saves to Desktop. It's manual, repetitive, and leaves junk files on the Desktop.

## 3. Goal
Collapse that entire flow into one shortcut: **capture region → auto Lens search in new tab**, with zero disk writes.

## 4. Target user
Individual resellers browsing estate-sale / marketplace listings in Chrome on macOS.

## 5. Core user flow (v1)
1. User is on a listing page.
2. User presses the extension shortcut (`Cmd+Shift+Y`, configurable) **or** clicks the toolbar icon.
3. A dimming overlay appears; the cursor becomes a crosshair.
4. User drags a rectangle around the item (like macOS `Cmd+Shift+4`, but ours).
5. On mouse-up, the selected region is captured **in memory** (data URL, never written to disk).
6. A new tab opens and **auto-submits** the image to Google Lens; results render immediately.
7. Overlay dismisses; the original tab is untouched.
- `Esc` at any point cancels the overlay with no capture.

## 6. Confirmed decisions (from discovery)
| # | Decision |
|---|----------|
| Capture | Drag-to-select region (not full page) |
| Storage | In-memory only — never saved to disk |
| Search engine | Google Lens |
| Results | Open in a new tab; keep sale page open |
| Trigger | Toolbar icon click **and** custom keyboard shortcut (`Cmd+Shift+Y`) |
| Post-select | Auto-search immediately (no confirm/preview) |
| Platform | Chrome, Manifest V3 |
| Multi-search (eBay, etc.) | Out of scope for v1 |

## 7. Functional requirements
- **FR1** Trigger via `chrome.action` icon click and a `chrome.commands` shortcut (default `Cmd+Shift+Y`, user-remappable at `chrome://extensions/shortcuts`).
- **FR2** Inject a full-viewport selection overlay with crosshair + live rubber-band rectangle and dimmed backdrop.
- **FR3** Capture the visible tab (`chrome.tabs.captureVisibleTab`, PNG data URL) and crop to the selected rectangle via an offscreen `<canvas>` (account for `devicePixelRatio`).
- **FR4** Never call `chrome.downloads` or write to the filesystem; the cropped image lives only as an in-memory blob/data URL.
- **FR5** Open a new tab to an internal uploader page that builds a multipart form and POSTs `encoded_image` to `https://lens.google.com/v3/upload`, submitting the form so the tab navigates to Lens results.
- **FR6** `Esc` cancels; clicking without dragging (zero-area selection) cancels safely.

## 8. Technical approach
- **MV3 architecture:** background service worker (trigger routing) → content script (overlay + selection) → offscreen crop → uploader page (Lens form submit).
- **Capture:** `chrome.tabs.captureVisibleTab` returns the viewport as a data URL; crop client-side with canvas using the selection rect scaled by `devicePixelRatio`.
- **Lens hand-off (key detail):** a raw `fetch()` to Lens is blocked, so the uploader page constructs a real `<form action="https://lens.google.com/v3/upload?ep=ccm&st=<ts>" method="POST" enctype="multipart/form-data">` with an `encoded_image` file input (plus `processed_image_dimensions`) and calls `form.submit()`, navigating that tab to results. (Pattern proven by the open-source `Search-on-Google-Lens` add-on.)
- **In-memory transfer:** pass the cropped image to the uploader tab via `chrome.storage.session` / message passing (not a giant URL param), then clear it after submit.

## 9. Permissions (manifest)
- `activeTab`, `scripting` — inject overlay + capture on demand.
- `commands` — keyboard shortcut.
- `storage` (session) — transient image hand-off.
- `host_permissions`: `https://lens.google.com/*` for the uploader page.
- No `downloads`, no broad host access beyond what capture requires.

## 10. Non-goals (v1)
- No multi-engine search (eBay sold, Google Images, etc.).
- No saving/organizing/history of captures.
- No price analysis, OCR, or listing creation.
- No Firefox/Edge/Windows-specific handling (Chrome/macOS focus).

## 11. Success criteria (test project "done")
- Loading the unpacked extension in Chrome, pressing `Cmd+Shift+Y` (or clicking the icon) on a real listing page, drag-selecting an item, results in a new Google Lens tab showing visual matches for that item — with no file written to Desktop — in a single motion.

## 12. Open risks
- **Lens endpoint drift:** Google occasionally changes the upload endpoint/params; isolate it behind one module so it's a one-line fix. Fallback: `searchbyimage/upload` (Google Images) if Lens breaks.
- **`captureVisibleTab` limits:** only captures the visible viewport (fine for on-screen items); cannot capture cross-origin iframes' protected content.

## 13. Feature Request (for the tracker)
> **Title:** One-shortcut region-capture → Google Lens search (in-memory)
>
> **As a** furniture/estate-sale flipper
> **I want** to press one shortcut, drag a box around an item, and have Google Lens open with that image automatically
> **so that** I can price/identify items in seconds without saving screenshots to my Desktop.
>
> **Acceptance criteria**
> - Trigger by toolbar icon and `Cmd+Shift+Y`.
> - Drag-to-select overlay with crosshair; `Esc` cancels.
> - Selected region captured in memory only (no disk write).
> - New tab auto-submits the image to Google Lens and shows results.
> - Original tab remains open and unchanged.
