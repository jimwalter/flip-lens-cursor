// Backend client abstraction. Local-only by default: with no apiBaseUrl / flags
// off, every method is a safe no-op and nothing leaves the device. When the
// backend ships, implement the TODOs behind the existing method signatures.

import { CONFIG } from "./config.js";
import { getSession } from "./auth.js";

async function authHeaders() {
  const session = await getSession();
  // Real impl: return { Authorization: `Bearer ${session.token}` }.
  return { "X-Flip-Session": session.id };
}

export const api = {
  // Returns the user's plan from the server, or null to let callers fall back.
  async fetchEntitlements() {
    if (!CONFIG.apiBaseUrl || !CONFIG.flags.billing) return null;
    // TODO: GET `${CONFIG.apiBaseUrl}/v1/entitlements` with authHeaders().
    return null;
  },

  // Push/pull history for the signed-in user. No-op until cloud sync ships.
  async syncHistory(/* entries */) {
    if (!CONFIG.apiBaseUrl || !CONFIG.flags.cloudSync) return { synced: false };
    // TODO: reconcile local + remote history at `${CONFIG.apiBaseUrl}/v1/history`.
    return { synced: false };
  },

  // Associate the anonymous/local id with a real account after sign-in.
  async identify(/* profile */) {
    if (!CONFIG.apiBaseUrl || !CONFIG.flags.hostedAuth) return { ok: false };
    // TODO: POST `${CONFIG.apiBaseUrl}/v1/identify` with authHeaders().
    return { ok: false };
  },

  _authHeaders: authHeaders
};
