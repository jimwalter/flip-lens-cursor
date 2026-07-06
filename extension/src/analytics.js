// Telemetry seam. No-op unless the user has opted in AND remote analytics is
// enabled by config. In local mode nothing is ever sent. Never throws.

import { CONFIG } from "./config.js";
import { getSettings } from "./settings.js";

export async function track(event, props = {}) {
  try {
    const settings = await getSettings();
    if (!CONFIG.flags.analytics || !settings.telemetryOptIn) return;
    // TODO: batch + POST events to `${CONFIG.apiBaseUrl}/v1/events`.
    void event;
    void props;
  } catch (e) {
    // Telemetry must never affect the product.
  }
}
