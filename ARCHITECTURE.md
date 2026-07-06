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
| `config.js` | Env, endpoints, feature flags, plan catalog, free scan limit | `env=development`, empty URLs, flags off | Set `env=production`, fill `apiBaseUrl`/`authBaseUrl`/`checkoutUrl`, flip flags |
| `email.js` | Email validation + normalization + disposable blocklist | used client-side | **reuse verbatim on the backend** (server must re-check) |
| `account.js` | Signup/verify lifecycle, trial/paid status | local mock: generates + verifies code on-device | Implement register/verify against `apiBaseUrl`; set `flags.hostedAuth` |
| `quota.js` | Free-trial scan accounting | `chrome.storage.local` | Server becomes source of truth (client just displays) |
| `auth.js` | Session abstraction | Anonymous local session w/ stable id | Implement hosted OAuth/JWT behind `getSession/signIn/signOut` |
| `entitlements.js` | Single source of "what can this user do" + quota view | paid→Pro; dev default Free (simulator for Pro) | Read plan from token/`api.fetchEntitlements()` |
| `api.js` | Backend client | No-op (no network to our servers) | Implement REST calls to `apiBaseUrl` |
| `history-store.js` | History repository (enforces plan limits) | `chrome.storage.local` | Add cloud reconcile via `api.syncHistory()` |
| `analytics.js` | Telemetry | No-op; opt-in off | POST events when opted-in + flag on |
| `settings.js` | Device settings | local | subset can move to account profile |

## Gate: email → verify → 10 free scans → convert (v1.4)

Flow (enforced in `background.js` `startCapture` → `evaluateGate()`):

1. **No account** → sidebar shows the **email** screen (email + optional marketing consent).
2. **Pending** → **verify** screen (6-digit code; dev surfaces the mock code on-screen).
3. **Active + trial left** → capture proceeds; `quota.increment()` per successful scan; sidebar shows a trial meter.
4. **Active + trial exhausted** (Free) → **paywall**; Upgrade → Stripe Checkout (prod) or simulated purchase (dev) → Pro/unlimited.

**Abuse control:** accounts/quota are keyed on the **normalized** email (`email.js` collapses Gmail dots + any `+tag`, unifies `googlemail.com`, blocks disposable domains), so alias tricks map to one account. The client counter is advisory — **the backend must be the source of truth** (a local counter is bypassable by reinstalling/clearing storage). Requiring a *verified* email is the main lever that keeps bots — and therefore cloud usage/cost — down.

### Backend contract (to implement for production)

| Method + path | Purpose | Notes |
|---|---|---|
| `POST /v1/auth/register` `{email, marketingOptIn}` | Create/lookup account, email a code | Re-run `email.js` scrub server-side; store consent + timestamp; rate-limit per IP/email |
| `POST /v1/auth/verify` `{email, code}` | Verify → returns session token | Expire codes; cap attempts |
| `POST /v1/auth/resend` `{email}` | Re-send code | Rate-limit |
| `GET /v1/entitlements` (auth) | Current plan | Derived from Stripe customer→plan |
| `GET /v1/quota` (auth) | `{used, limit}` | **Authoritative** scan count, keyed on normalized email |
| `POST /v1/scan` (auth) | Record a scan, return new count | Enforce limit here (reject when exhausted) |
| `POST /v1/history` (auth) | Optional cloud sync | Behind `flags.cloudSync` |
| `POST /v1/events` (auth) | Optional telemetry | Behind opt-in + `flags.analytics` |
| `POST /webhooks/stripe` | Checkout/subscription updates → set plan | Verify signature |

Email delivery via a provider (Resend/SendGrid/SES). At low volume the whole
stack fits free/hobby tiers, so verified-email gating keeps cost near zero.

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

- **Free:** **10 scans**, 25-item history, Lens only, local only.
- **Pro:** unlimited scans, large history, cloud sync, export, multi-engine (future).
- Dev builds default to **Free** so the trial/paywall is exercised; the plan
  simulator (Settings) or a simulated purchase switches to **Pro**.

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
