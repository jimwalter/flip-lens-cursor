// Entitlement resolution — the single place that decides what the current user
// can do. Billing/accounts plug in here; the rest of the app only asks
// `resolveEntitlements()` / `can(feature)` / `quotaView()` and never checks
// plans directly.

import { CONFIG, PLANS } from "./config.js";
import { getSettings } from "./settings.js";
import { getSession } from "./auth.js";
import { getAccount } from "./account.js";
import { getUsed } from "./quota.js";
import { api } from "./api.js";

export async function resolveEntitlements() {
  const account = await getAccount();

  // A converted (paid) user is Pro everywhere.
  if (account && account.paid) return fromPlan(PLANS.pro);

  if (CONFIG.env === "development") {
    // Dev preview of gating without billing. Default (auto) = Free so the
    // trial/paywall flow is actually exercised; switch to Pro to unlock.
    const settings = await getSettings();
    if (settings.simulatedPlan === "pro") return fromPlan(PLANS.pro);
    return fromPlan(PLANS.free);
  }

  // Production: the real plan comes from the backend / token claims.
  await getSession();
  if (CONFIG.flags.billing) {
    const remote = await api.fetchEntitlements();
    if (remote && PLANS[remote.planId]) return fromPlan(PLANS[remote.planId]);
  }
  return fromPlan(PLANS.free);
}

export async function can(feature) {
  const ent = await resolveEntitlements();
  return !!ent.limits[feature];
}

// Trial usage view for the UI / capture gate.
export async function quotaView() {
  const [ent, used] = await Promise.all([resolveEntitlements(), getUsed()]);
  const limit = ent.limits.scanLimit;
  const unlimited = limit >= 1000; // Pro is effectively unlimited
  return {
    used,
    limit,
    unlimited,
    remaining: unlimited ? Infinity : Math.max(0, limit - used)
  };
}

function fromPlan(plan) {
  return { planId: plan.id, label: plan.label, limits: { ...plan.limits } };
}
