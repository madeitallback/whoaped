const input = document.querySelector("#wallet");
const endpointInput = document.querySelector("#endpoint");
const button = document.querySelector("#open");
const endpoint = "https://whoaped-phi.vercel.app";

chrome.storage.local.get(["whoApedEndpoint", "whoHeldEndpoint", "followerAlphaEndpoint"], ({ whoApedEndpoint, whoHeldEndpoint, followerAlphaEndpoint }) => {
  const savedEndpoint = whoApedEndpoint || whoHeldEndpoint || followerAlphaEndpoint;
  if (savedEndpoint) { window.whoApedEndpoint = savedEndpoint; endpointInput.value = savedEndpoint; }
});

button.addEventListener("click", () => {
  const wallet = input.value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) { input.focus(); return; }
  const base = endpointInput.value.trim() || window.whoApedEndpoint || endpoint;
  chrome.storage.local.set({ whoApedEndpoint: base });
  chrome.tabs.create({ url: `${base}/?wallet=${encodeURIComponent(wallet)}` });
});
