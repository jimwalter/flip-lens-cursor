// Central configuration for FlipLens.
// Flip `ENV` to "production" and set the *BaseUrl values + flags as backend
// pieces come online. In "development" the app runs fully local and unlocked so
// it can be tested with no account and no backend.

export const ENV = "development"; // "development" | "production"

export const CONFIG = {
  env: ENV,
  version: "1.3.0",

  // Our backend endpoints. Empty in dev => local-only (no network to our servers).
  apiBaseUrl: "", // e.g. "https://api.fliplens.app"
  authBaseUrl: "", // hosted auth issuer, e.g. "https://auth.fliplens.app"

  // External services already in use (kept here for one source of truth).
  lensUploadUrl: "https://lens.google.com/v3/upload",

  // Feature flags — turn these on as each backend capability ships.
  flags: {
    hostedAuth: false, // real account sign-in (OAuth/JWT)
    cloudSync: false, // sync history to the backend / across devices
    billing: false, // Stripe checkout + plan management
    analytics: false // remote telemetry (still additionally gated by user opt-in)
  }
};

// Plan catalog. `limits` are enforced by entitlements.js / history-store.js.
export const PLANS = {
  free: {
    id: "free",
    label: "Free",
    limits: { historyMax: 25, cloudSync: false, export: false, multiEngine: false }
  },
  pro: {
    id: "pro",
    label: "Pro",
    limits: { historyMax: 1000, cloudSync: true, export: true, multiEngine: true }
  }
};

// In development everything is unlocked, so the product is fully testable
// without creating an account or paying.
export const DEV_ENTITLEMENTS = {
  planId: "dev",
  label: "Developer (all features)",
  limits: { historyMax: 1000, cloudSync: true, export: true, multiEngine: true }
};
