// Account lifecycle: capture a verified email before use, then track trial /
// paid status. Backed by a pluggable backend — in development a local MOCK
// simulates sending a code (surfaced to the tester) and verifies on-device, so
// the whole flow works with no server and no real emails. In production these
// call the real API (CONFIG.flags.hostedAuth + CONFIG.apiBaseUrl).
//
// Abuse control: accounts are keyed on the NORMALIZED email (see email.js), so
// dots / +aliases collapse to one account. The backend MUST re-check this.

import { CONFIG } from "./config.js";
import { scrub } from "./email.js";

const KEY = "flip_account";

// account shape:
// { email, normalized, status: "pending" | "active", marketingOptIn,
//   paid, createdAt, verifiedAt, _devCode? }

export async function getAccount() {
  const { [KEY]: account } = await chrome.storage.local.get(KEY);
  return account || null;
}

async function put(account) {
  await chrome.storage.local.set({ [KEY]: account });
  return account;
}

export async function registerEmail(rawEmail, marketingOptIn) {
  const check = scrub(rawEmail);
  if (!check.ok) return { ok: false, error: check.reason };

  if (CONFIG.flags.hostedAuth && CONFIG.apiBaseUrl) {
    // TODO(prod): POST /v1/auth/register { email, marketingOptIn } → server emails a code.
    // return { ok: true };
  }

  // Dev mock: generate a code and surface it so the tester can verify.
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await put({
    email: check.email,
    normalized: check.normalized,
    status: "pending",
    marketingOptIn: !!marketingOptIn,
    paid: false,
    createdAt: Date.now(),
    verifiedAt: null,
    _devCode: code
  });
  return { ok: true, devCode: code };
}

export async function verify(code) {
  const account = await getAccount();
  if (!account) return { ok: false, error: "Start by entering your email." };

  if (CONFIG.flags.hostedAuth && CONFIG.apiBaseUrl) {
    // TODO(prod): POST /v1/auth/verify { email, code } → { verified }.
  }

  if (!account._devCode || String(code).trim() !== account._devCode) {
    return { ok: false, error: "That code doesn't match. Check and try again." };
  }
  const { _devCode, ...rest } = account;
  await put({ ...rest, status: "active", verifiedAt: Date.now() });
  return { ok: true };
}

export async function resend() {
  const account = await getAccount();
  if (!account) return { ok: false, error: "Enter your email first." };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await put({ ...account, _devCode: code });
  return { ok: true, devCode: code };
}

// Dev-only: simulate a successful purchase (prod uses Stripe + webhook → plan).
export async function simulatePurchase() {
  const account = await getAccount();
  if (!account) return { ok: false };
  await put({ ...account, paid: true });
  return { ok: true };
}

export async function reset() {
  await chrome.storage.local.remove(KEY);
}

// Safe view for the UI (never leak the dev code except in development).
export function publicView(account) {
  if (!account) return null;
  return {
    email: account.email,
    normalized: account.normalized,
    status: account.status,
    marketingOptIn: !!account.marketingOptIn,
    paid: !!account.paid,
    devCode: CONFIG.env === "development" ? account._devCode || null : null
  };
}
