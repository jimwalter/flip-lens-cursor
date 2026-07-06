// User-adjustable settings, persisted locally. These are device-level prefs;
// once cloud sync exists, a subset could move to the account profile.

const KEY = "flip_settings";

const DEFAULTS = {
  // Dev-only preview of plan gating without billing: "auto" | "free" | "pro".
  // "auto" uses the real/dev entitlement resolution.
  simulatedPlan: "auto",
  // Telemetry is opt-in and off by default; nothing leaves the device unless on
  // AND CONFIG.flags.analytics is enabled.
  telemetryOptIn: false,
  // User's desire to sync (only acts once CONFIG.flags.cloudSync ships).
  cloudSyncEnabled: false
};

export async function getSettings() {
  const { [KEY]: stored } = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(stored || {}) };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
