// FlipLens uploader page.
// Reads the in-memory capture (keyed by capture id) handed off via session
// storage and submits it to Google Lens by POSTing a real multipart form — a
// plain fetch to Lens is blocked, but a form submit navigates this tab straight
// to the results, where results.js attaches a title + price to the history.

(async () => {
  const status = document.getElementById("status");
  const cid = new URLSearchParams(location.search).get("cid");
  const key = `img_${cid}`;

  const stored = await chrome.storage.session.get(key);
  const image = stored[key];
  if (!image) {
    status.textContent = "No capture found. Trigger FlipLens again to search.";
    return;
  }
  // One-shot hand-off: clear it so the image never lingers.
  await chrome.storage.session.remove(key);

  const file = new File([dataUrlToBlob(image)], "capture.png", { type: "image/png" });

  const form = document.createElement("form");
  form.action = `https://lens.google.com/v3/upload?ep=ccm&s=&st=${Date.now()}`;
  form.method = "POST";
  form.enctype = "multipart/form-data";
  form.style.display = "none";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.name = "encoded_image";
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  form.appendChild(fileInput);

  const dims = document.createElement("input");
  dims.type = "hidden";
  dims.name = "processed_image_dimensions";
  dims.value = "1000,1000";
  form.appendChild(dims);

  document.body.appendChild(form);
  form.submit();
})();

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/:(.*?);/) || [null, "image/png"])[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
