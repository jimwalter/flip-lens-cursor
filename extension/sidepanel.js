// FlipLens side panel: renders the persisted search history with thumbnail,
// auto/editable title, and price range. Stays open while browsing; the × button
// collapses (closes) it.

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");

document.getElementById("collapse").addEventListener("click", () => window.close());

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "FLIPLENS_CLEAR" });
});

// Show the platform-correct shortcut hint.
chrome.commands.getAll().then((cmds) => {
  const c = cmds.find((x) => x.name === "start-capture");
  if (c && c.shortcut) document.getElementById("shortcut-hint").textContent = c.shortcut;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "FLIPLENS_HISTORY_UPDATED") render();
});

render();

async function render() {
  const { history } = await chrome.runtime.sendMessage({ type: "FLIPLENS_GET_HISTORY" });
  const items = history || [];

  emptyEl.hidden = items.length > 0;
  listEl.innerHTML = "";

  for (const entry of items) {
    listEl.appendChild(renderCard(entry));
  }
}

function renderCard(entry) {
  const li = document.createElement("li");
  li.className = "card";

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = entry.thumbnail;
  thumb.alt = entry.title || "capture";
  thumb.title = "Open the Google Lens results";
  thumb.addEventListener("click", () => openSearch(entry));
  li.appendChild(thumb);

  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "title";
  if (entry.status === "searching" && !entry.title) {
    title.classList.add("searching");
    title.textContent = "Searching…";
    const spin = document.createElement("span");
    spin.className = "spinner";
    title.prepend(spin);
  } else {
    title.contentEditable = "true";
    title.spellcheck = false;
    title.textContent = entry.title || "Untitled capture";
    title.title = "Click to rename";
    const commit = () => {
      const value = title.textContent.trim();
      chrome.runtime.sendMessage({ type: "FLIPLENS_RENAME", cid: entry.id, title: value });
    };
    title.addEventListener("blur", commit);
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        title.blur();
      }
    });
  }
  body.appendChild(title);

  const price = document.createElement("div");
  if (entry.priceMin != null) {
    price.className = "price";
    price.textContent = formatRange(entry.priceMin, entry.priceMax, entry.currency);
  } else {
    price.className = "price unknown";
    price.textContent = entry.status === "searching" ? "Estimating price…" : "No price found";
  }
  body.appendChild(price);

  const meta = document.createElement("div");
  meta.className = "meta";

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = relativeTime(entry.createdAt);
  meta.appendChild(time);

  const actions = document.createElement("div");
  actions.className = "row-actions";

  const open = document.createElement("button");
  open.className = "link";
  open.textContent = "Open";
  open.addEventListener("click", () => openSearch(entry));
  actions.appendChild(open);

  const del = document.createElement("button");
  del.className = "link danger";
  del.textContent = "Delete";
  del.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "FLIPLENS_DELETE", cid: entry.id })
  );
  actions.appendChild(del);

  meta.appendChild(actions);
  body.appendChild(meta);
  li.appendChild(body);
  return li;
}

function openSearch(entry) {
  if (entry.searchUrl) chrome.runtime.sendMessage({ type: "FLIPLENS_OPEN", url: entry.searchUrl });
}

function formatRange(min, max, currency) {
  const sym = currency || "$";
  const fmt = (n) => sym + Math.round(n).toLocaleString();
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
