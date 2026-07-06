// Central configuration for FlipLens.
// Flip `ENV` to "production" and set the *BaseUrl values + flags as backend
// pieces come online. In "development" the app runs locally with a mock backend
// (email verification + quota are simulated on-device) so the full signup →
// verify → trial → convert flow is testable without a server or real emails.

export const ENV = "development"; // "development" | "production"

export const CONFIG = {
  env: ENV,
  version: "1.4.0",

  // Our backend endpoints. Empty in dev => local mock (no network to our servers).
  apiBaseUrl: "", // e.g. "https://api.fliplens.app"
  authBaseUrl: "", // hosted auth issuer, e.g. "https://auth.fliplens.app"
  checkoutUrl: "", // Stripe Checkout link for upgrading to Pro

  // External services already in use (kept here for one source of truth).
  lensUploadUrl: "https://lens.google.com/v3/upload",

  // Feature flags — turn these on as each backend capability ships.
  flags: {
    hostedAuth: false, // real account/email verification via backend
    cloudSync: false, // sync history to the backend / across devices
    billing: false, // Stripe checkout + plan management
    analytics: false // remote telemetry (still additionally gated by user opt-in)
  }
};

// The free trial: number of scans before a user must convert.
export const FREE_SCAN_LIMIT = 10;

// Plan catalog. `limits` are enforced by entitlements.js / quota.js /
// history-store.js. Edit these to change the Free/Pro split.
export const PLANS = {
  free: {
    id: "free",
    label: "Free",
    limits: {
      scanLimit: FREE_SCAN_LIMIT,
      historyMax: 25,
      cloudSync: false,
      export: false,
      multiEngine: false
    }
  },
  pro: {
    id: "pro",
    label: "Pro",
    limits: {
      scanLimit: Number.MAX_SAFE_INTEGER,
      historyMax: 1000,
      cloudSync: true,
      export: true,
      multiEngine: true
    }
  }
};
