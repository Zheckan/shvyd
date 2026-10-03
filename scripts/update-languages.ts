import { settingsFromEnv, isRecord } from "../src/settings";

type Entry = { code: string; name: string; label: string; direction: "ltr" | "rtl"; azure: string | null; deepl: string | null };
const settings = settingsFromEnv(Bun.env);
if (!settings.deepl.key) throw new Error("Configure DEEPL_API_KEY to refresh both language catalogs.");
const sources = {
  azure: "https://api.cognitive.microsofttranslator.com/languages?api-version=2026-06-06&scope=translation",
  deepl: settings.deepl.endpoint + "/v3/languages?resource=translate_text",
};
async function metadata(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Language catalog request failed with status ${response.status}.`);
  return response.json();
}
const [azure, deepl] = await Promise.all([
  metadata(sources.azure, { "Accept-Language": "en" }),
  metadata(sources.deepl, { Authorization: `DeepL-Auth-Key ${settings.deepl.key}` }),
]);
if (!isRecord(azure) || !isRecord(azure.translation) || !Array.isArray(deepl)) throw new Error("Unexpected language catalog response.");
const entries = new Map<string, Entry>();
for (const [code, value] of Object.entries(azure.translation)) {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.nativeName !== "string"
    || value.dir !== "ltr" && value.dir !== "rtl") throw new Error("Invalid Azure language entry.");
  entries.set(code.toLowerCase(), { code: code.toLowerCase(), name: value.name, label: value.nativeName, direction: value.dir, azure: code, deepl: null });
}
for (const value of deepl) {
  if (!isRecord(value) || typeof value.lang !== "string" || typeof value.name !== "string") throw new Error("Invalid DeepL language entry.");
  if (value.usable_as_target !== true || value.status !== "stable") continue;
  const code = value.lang.toLowerCase();
  const previous = entries.get(code);
  let label = value.name;
  try { label = new Intl.DisplayNames([value.lang], { type: "language" }).of(value.lang) ?? label; } catch { /* Keep the provider name for unsupported locales. */ }
  entries.set(code, previous ? { ...previous, deepl: value.lang } : {
    code, name: value.name, label, direction: /^(ar|he|fa|ur|ps|sd|prs)(-|$)/.test(code) ? "rtl" : "ltr", azure: null, deepl: value.lang,
  });
}
const portuguese = entries.get("pt");
if (portuguese) { portuguese.name = "Portuguese"; portuguese.label = "Português"; }
const languages = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
if (!languages.some(value => value.code === "uk" && value.azure && value.deepl) || languages.length < 100) throw new Error("Incomplete catalog; keeping the previous snapshot.");
await Bun.write(new URL("../src/language-data.json", import.meta.url), JSON.stringify({
  updated: new Date().toISOString().slice(0, 10), sources, languages,
}, null, 2) + "\n");
console.info(`Bundled ${languages.length} targets: ${languages.filter(x => x.azure).length} Azure, ${languages.filter(x => x.deepl).length} DeepL.`);
