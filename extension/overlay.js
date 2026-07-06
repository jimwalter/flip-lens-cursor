// FlipLens selection overlay (injected on demand).
// Draws a dimmed full-viewport layer with a crosshair and rubber-band
// rectangle. On mouse-up it hides itself, then asks the background worker to
// capture + crop the selected region. Esc (or a zero-area click) cancels.

(() => {
  if (window.__flipLensActive) return;
  window.__flipLensActive = true;

  const overlay = document.createElement("div");
  overlay.className = "fliplens-overlay";

  const rectEl = document.createElement("div");
  rectEl.className = "fliplens-rect";

  const hint = document.createElement("div");
  hint.className = "fliplens-hint";
  hint.textContent = "Drag to select an item  ·  Esc to cancel";

  overlay.appendChild(rectEl);
  overlay.appendChild(hint);
  document.documentElement.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  function cleanup() {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
    window.__flipLensActive = false;
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
    }
  }
  document.addEventListener("keydown", onKey, true);

  function currentRect(event) {
    const x = Math.min(event.clientX, startX);
    const y = Math.min(event.clientY, startY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);
    return { x, y, width, height };
  }

  overlay.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    hint.style.display = "none";
    rectEl.style.display = "block";
    rectEl.style.left = `${startX}px`;
    rectEl.style.top = `${startY}px`;
    rectEl.style.width = "0px";
    rectEl.style.height = "0px";
  });

  overlay.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const r = currentRect(event);
    rectEl.style.left = `${r.x}px`;
    rectEl.style.top = `${r.y}px`;
    rectEl.style.width = `${r.width}px`;
    rectEl.style.height = `${r.height}px`;
  });

  overlay.addEventListener("mouseup", (event) => {
    if (!dragging) return;
    dragging = false;
    const r = currentRect(event);

    // A tiny/zero-area selection is treated as an accidental click: cancel.
    if (r.width < 5 || r.height < 5) {
      cleanup();
      return;
    }

    const rect = { ...r, dpr: window.devicePixelRatio || 1 };

    // Hide the overlay so it isn't captured, then wait for a paint before
    // asking the worker to grab the visible tab.
    overlay.style.display = "none";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ type: "FLIPLENS_SELECTION", rect }, () => {
          cleanup();
        });
      })
    );
  });
})();
