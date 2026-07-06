// FlipLens settings page. Reads app state from the background worker and writes
// user settings back. Account/billing/sync controls are placeholders wired to
// the same seams the real flows will use.

const els = {
  planBadge: document.getElementById("plan-badge"),
  accountEmail: document.getElementById("account-email"),
  accountStatus: document.getElementById("account-status"),
  accountScans: document.getElementById("account-scans"),
  accountMarketing: document.getElementById("account-marketing"),
  sessionId: document.getElementById("session-id"),
  devReset: document.getElementById("dev-reset"),
  planLabel: document.getElementById("plan-label"),
  limits: document.getElementById("limits"),
  simPlan: document.getElementById("sim-plan"),
  cloudSync: document.getElementById("cloud-sync"),
  syncNote: document.getElementById("sync-note"),
  telemetry: document.getElementById("telemetry"),
  version: document.getElementById("version"),
  env: document.getElementById("env")
};

const LIMIT_LABELS = {
  historyMax: (v) => `History: ${v >= 1000 ? "unlimited" : v} items`,
  cloudSync: (v) => `Cloud sync${v ? "" : ""}`,
  export: (v) => "Export history",
  multiEngine: (v) => "Multi-engine search"
};

let state = null;

init();

async function init() {
  state = await chrome.runtime.sendMessage({ type: "FLIPLENS_GET_STATE" });
  paint();

  els.simPlan.addEventListener("change", () =>
    save({ simulatedPlan: els.simPlan.value })
  );
  els.telemetry.addEventListener("change", () =>
    save({ telemetryOptIn: els.telemetry.checked })
  );
  els.cloudSync.addEventListener("change", () =>
    save({ cloudSyncEnabled: els.cloudSync.checked })
  );
  els.devReset.addEventListener("click", async () => {
    const res = await chrome.runtime.sendMessage({ type: "FLIPLENS_DEV_RESET" });
    state = res.state;
    paint();
  });
}

async function save(patch) {
  state = await chrome.runtime.sendMessage({ type: "FLIPLENS_SET_SETTINGS", patch });
  paint();
}

function paint() {
  if (!state) return;
  const { entitlements: ent, settings, session, version, env, flags, account, quota } = state;

  els.planBadge.textContent = ent.label;
  els.planLabel.textContent = ent.label;
  els.sessionId.textContent = session.id;

  els.accountEmail.textContent = account ? account.email : "—";
  els.accountStatus.textContent = !account
    ? "No email yet"
    : account.status === "active"
    ? "Verified"
    : "Pending verification";
  els.accountScans.textContent = quota.unlimited
    ? "Unlimited (Pro)"
    : `${quota.used} / ${quota.limit}`;
  els.accountMarketing.textContent = account ? (account.marketingOptIn ? "Yes" : "No") : "—";
  els.devReset.hidden = env !== "development";

  els.limits.innerHTML = "";
  for (const [key, value] of Object.entries(ent.limits)) {
    const li = document.createElement("li");
    const label = LIMIT_LABELS[key] ? LIMIT_LABELS[key](value) : `${key}: ${value}`;
    if (typeof value === "boolean") {
      li.textContent = (value ? "✓ " : "✗ ") + label;
      if (!value) li.className = "no";
    } else {
      li.textContent = label;
    }
    els.limits.appendChild(li);
  }

  els.simPlan.value = settings.simulatedPlan || "auto";
  els.simPlan.disabled = env !== "development";

  els.telemetry.checked = !!settings.telemetryOptIn;

  els.cloudSync.checked = !!settings.cloudSyncEnabled;
  els.cloudSync.disabled = !flags.cloudSync;
  els.syncNote.textContent = flags.cloudSync
    ? "Your history syncs to your account across devices."
    : "Coming soon — history is stored locally on this device for now.";

  els.version.textContent = version;
  els.env.textContent = env;
}
