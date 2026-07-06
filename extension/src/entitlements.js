// Entitlement resolution — the single place that decides what the current user
// can do. Billing/accounts plug in here later; the rest of the app only asks
// `resolveEntitlements()` / `can(feature)` and never checks plans directly.

import { CONFIG, PLANS, DEV_ENTITLEMENTS } from "./config.js";
import { getSettings } from "./settings.js";
import { getSession } from "./auth.js";
import { api } from "./api.js";

export async function resolveEntitlements() {
  const settings = await getSettings();

  // Development: unlocked by default, with an optional plan simulator so gating
  // can be previewed without any billing.
  if (CONFIG.env === "development") {
    if (settings.simulatedPlan === "free") return fromPlan(PLANS.free);
    if (settings.simulatedPlan === "pro") return fromPlan(PLANS.pro);
    return { ...DEV_ENTITLEMENTS };
  }

  // Production: the real plan comes from the backend / token claims once billing
  // exists. Until then, default to Free.
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

function fromPlan(plan) {
  return { planId: plan.id, label: plan.label, limits: { ...plan.limits } };
}
