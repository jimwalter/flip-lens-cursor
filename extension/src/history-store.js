// History repository. The rest of the app reads/writes history only through
// here, so the backing store can evolve (local now, cloud-synced later) without
// touching callers. Entry cap is enforced from the current plan's entitlements.

import { CONFIG } from "./config.js";
import { resolveEntitlements } from "./entitlements.js";
import { api } from "./api.js";

const KEY = "flip_history";

export async function getHistory() {
  const { [KEY]: history } = await chrome.storage.local.get(KEY);
  return Array.isArray(history) ? history : [];
}

async function setHistory(history) {
  await chrome.storage.local.set({ [KEY]: history });
}

async function historyCap() {
  const ent = await resolveEntitlements();
  return ent.limits.historyMax || 25;
}

export async function addEntry(entry) {
  const history = await getHistory();
  history.unshift(entry);
  await setHistory(history.slice(0, await historyCap()));
  maybeSync();
}

export async function updateEntry(cid, patch) {
  const history = await getHistory();
  const idx = history.findIndex((e) => e.id === cid);
  if (idx === -1) return null;
  history[idx] = { ...history[idx], ...patch };
  await setHistory(history);
  maybeSync();
  return history[idx];
}

export async function getEntry(cid) {
  return (await getHistory()).find((e) => e.id === cid) || null;
}

export async function deleteEntry(cid) {
  await setHistory((await getHistory()).filter((e) => e.id !== cid));
  maybeSync();
}

export async function clearHistory() {
  await setHistory([]);
  maybeSync();
}

function maybeSync() {
  if (CONFIG.flags.cloudSync) api.syncHistory().catch(() => {});
}
