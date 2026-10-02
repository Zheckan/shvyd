import { createClient } from "./client";
import { mountTranslator } from "./popup";
import { isProvider } from "./settings";

const client = createClient(async request => {
  const response = await fetch("/api", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  });
  return response.json();
});
mountTranslator(client);
const provider = document.getElementById("demo-provider");
if (provider instanceof HTMLSelectElement) {
  void client.preferences().then(preferences => { provider.value = preferences.provider; });
  provider.addEventListener("change", () => {
    if (isProvider(provider.value)) void client.updatePreferences({ provider: provider.value });
  });
}
const theme = new URL(location.href).searchParams.get("style") ?? "editorial";
for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-style]")) {
  if (link.dataset.style === theme) link.setAttribute("aria-current", "page");
}
