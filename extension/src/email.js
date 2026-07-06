// Email validation + normalization. Used client-side for instant feedback and
// designed to be reused verbatim on the backend (the server MUST re-run this —
// client checks are advisory only).
//
// Normalization collapses common free-tier abuse tricks to ONE canonical
// address so a person can't mint many "different" emails from one inbox:
//   - lowercase + trim
//   - Gmail/Googlemail: strip dots and any "+tag" in the local part; unify domain
//   - other providers: strip "+tag" (conservative; most honor it)
// The canonical address is what quota/accounts should be keyed on.

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwaway.email", "yopmail.com", "getnada.com", "trashmail.com",
  "sharklasers.com", "dispostable.com", "maildrop.cc", "fakeinbox.com", "mintemail.com",
  "mohmal.com", "spamgourmet.com", "mailnesia.com", "tempinbox.com", "emailondeck.com"
]);

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function isValidFormat(raw) {
  return typeof raw === "string" && EMAIL_RX.test(raw.trim());
}

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at === -1) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  // Drop +tag for everyone (conservative).
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);

  // Gmail also ignores dots and treats googlemail as gmail.
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

export function isDisposable(email) {
  const at = String(email || "").lastIndexOf("@");
  if (at === -1) return false;
  return DISPOSABLE_DOMAINS.has(email.slice(at + 1).toLowerCase());
}

// Full check → { ok, email (display), normalized, reason }
export function scrub(raw) {
  const email = String(raw || "").trim();
  if (!isValidFormat(email)) {
    return { ok: false, reason: "Please enter a valid email address." };
  }
  const normalized = normalizeEmail(email);
  if (isDisposable(normalized)) {
    return { ok: false, reason: "Disposable email addresses aren't allowed." };
  }
  return { ok: true, email: email.toLowerCase(), normalized };
}
