# FlipLens — Architecture & Commercialization

This documents how FlipLens is structured and the seams that make it ready to
become a commercial product **without** payment or auth being built yet. Today it
runs fully local, unlocked, and **testable with no account**.

## Runtime components (Chrome MV3)

| Component | File(s) | Role |
|---|---|---|
| Service worker (core) | `background.js` (ES module) | Trigger routing, capture + crop, owns app state and the history API; wires the commercial seams in `src/`. |
| Selection overlay | `overlay.js`, `overlay.css` | Injected drag-to-select UI. |
| Uploader tab | `uploader.html`, `uploader.js` | POSTs the capture to Google Lens (form submit). |
| Results scraper | `results.js` | Content script on Lens/Google results: extracts title + sourced price range; re-reports on re-crop. |
| Sidebar | `sidepanel.html/.css/.js` | History UI, plan badge, export (gated), settings entry. |
| Settings | `options.html/.css/.js` | Account/plan/sync/privacy — placeholders on real seams + dev plan simulator. |

## Core modules (`extension/src/`) — the commercial seams

| Module | Responsibility | Default (local) | Becomes commercial by… |
|---|---|---|---|
| `config.js` | Env, endpoints, feature flags, plan catalog | `env=development`, empty URLs, flags off | Set `env=production`, fill `apiBaseUrl`/`authBaseUrl`, flip flags |
| `auth.js` | Session abstraction | Anonymous local session w/ stable id | Implement hosted OAuth/JWT behind `getSession/signIn/signOut` |
| `entitlements.js` | Single source of "what can this user do" | Dev = all unlocked; simulator for Free/Pro | Read plan from token/`api.fetchEntitlements()` |
| `api.js` | Backend client | No-op (no network to our servers) | Implement REST calls to `apiBaseUrl` |
| `history-store.js` | History repository (enforces plan limits) | `chrome.storage.local` | Add cloud reconcile via `api.syncHistory()` |
| `analytics.js` | Telemetry | No-op; opt-in off | POST events when opted-in + flag on |
| `settings.js` | Device settings | local | subset can move to account profile |

**Rule:** UI and feature code never check plans or call the network directly —
they ask `resolveEntitlements()` / `can(feature)` and talk to the worker via
`FLIPLENS_*` messages. Swapping local → cloud is a change inside `src/` only.

## Data model (history entry)

```
{
  id, userId,            // userId = local session id today, real account id later
  createdAt, status,     // "searching" | "done"
  thumbnail,             // small JPEG data URL (only thumbnails persist)
  title, titleAuto,      // auto title; titleAuto=false once user renames
  priceMin, priceMax, priceMinUrl, priceMaxUrl, currency,
  sourcePageUrl,         // page the screenshot came from
  searchUrl              // Lens results URL (updates on re-crop)
}
```

Full captures are **never persisted or uploaded to us** — only kept in
`storage.session` transiently to hand off to Lens.

## Plans (assumed; edit in `config.js`)

- **Free:** 25-item history, Lens only, local only.
- **Pro:** large/unlimited history, cloud sync, export, multi-engine (future).
- **Developer (dev builds):** everything unlocked → no account needed to test.

## What's needed to begin (to actually go commercial)

1. **Decide the model** — confirm freemium + Pro price point and the Free/Pro
   feature split (draft in `config.js` `PLANS`).
2. **Backend service** — host a small API (`apiBaseUrl`) providing:
   `/v1/entitlements`, `/v1/history` (sync), `/v1/events` (telemetry),
   `/v1/identify`. Any stack (e.g. Cloud Run / Fly / Lambda + Postgres).
3. **Auth** — a hosted identity provider (e.g. Auth0/Clerk/Firebase/Supabase or
   Google OAuth) issuing JWTs; implement `auth.js` and set `flags.hostedAuth`.
4. **Billing** — a Stripe account + products/prices; a checkout + webhook that
   maps `customer → plan`; `api.fetchEntitlements()` reads it; set `flags.billing`.
   *(Chrome payments must go through an external checkout, not in-extension.)*
5. **Cloud sync (optional v1)** — implement `api.syncHistory()`; set `flags.cloudSync`.
6. **Legal/store** — Privacy Policy + ToS (needed for accounts, billing, and the
   store listing), a Chrome Web Store developer account ($5), store assets, and a
   permission-justification note (`activeTab`, `scripting`, Google host access).
7. **Analytics (optional)** — pick a provider; implement `analytics.track()`;
   keep it behind the opt-in + `flags.analytics`.
8. **Secrets** — Stripe keys, auth client secrets, DB creds live on the backend,
   **never** in the extension bundle.

Nothing above is required to build features or test today; each is an isolated
flip of a flag + a `src/` implementation.
