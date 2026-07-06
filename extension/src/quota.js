// Free-trial scan accounting. Locally tracked in dev; in production the server
// is the source of truth (the client only displays what the backend returns) —
// a client-only counter is trivially bypassed, so real enforcement lives in the
// backend keyed on the normalized email.

const KEY = "flip_usage";

export async function getUsed() {
  const { [KEY]: used } = await chrome.storage.local.get(KEY);
  return typeof used === "number" ? used : 0;
}

export async function increment() {
  const used = (await getUsed()) + 1;
  await chrome.storage.local.set({ [KEY]: used });
  return used;
}

export async function reset() {
  await chrome.storage.local.set({ [KEY]: 0 });
}
