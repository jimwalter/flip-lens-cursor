// Authentication abstraction.
// Today: a local anonymous session — no account required — with a stable
// per-install id so data can be attributed to a "user" and later migrated to a
// real account. Tomorrow: flip CONFIG.flags.hostedAuth and implement the hosted
// OAuth/JWT flow behind the same interface (getSession/isAuthenticated/signIn/out).

import { CONFIG } from "./config.js";

const KEY = "flip_session";

async function getOrCreateLocalSession() {
  const { [KEY]: stored } = await chrome.storage.local.get(KEY);
  if (stored && stored.id) return stored;
  const session = {
    id: `local-${crypto.randomUUID()}`,
    type: "anonymous",
    createdAt: Date.now()
  };
  await chrome.storage.local.set({ [KEY]: session });
  return session;
}

export async function getSession() {
  if (CONFIG.flags.hostedAuth) {
    // TODO: validate/refresh the stored access token against CONFIG.authBaseUrl.
    // Not implemented yet — fall back to the local anonymous session.
  }
  return getOrCreateLocalSession();
}

export async function isAuthenticated() {
  const session = await getSession();
  return session.type !== "anonymous";
}

// Intentionally stubbed until hosted auth is built.
export async function signIn() {
  throw new Error("Hosted sign-in is not enabled yet.");
}

export async function signOut() {
  // No-op for anonymous sessions; the real implementation clears tokens.
}
