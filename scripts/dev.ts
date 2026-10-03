import { resolve } from "node:path";
import { isLanguage, isProvider, isRecord, settingsFromEnv, type Settings } from "../src/settings";
import { createSettingsStore } from "../src/settings-store";
import { createTranslationService, TranslationError } from "../src/translation";

const root = resolve(import.meta.dir, "..");
const result = await Bun.build({
  entrypoints: [resolve(root, "src/demo.ts")], outdir: resolve(root, ".preview"),
  target: "browser", minify: false, env: "disable",
});
if (!result.success) throw new Error("The demo could not build.");
let persisted: Settings | undefined;
const store = createSettingsStore({
  read: async () => persisted,
  write: async settings => { persisted = settings; },
  seed: async () => settingsFromEnv(Bun.env),
});
const translator = createTranslationService({ readSettings: store.settings });
const styles = new Set(["editorial", "technical", "journal", "warm", "forest", "contrast", "neon", "gradient"]);
const server = Bun.serve({
  hostname: "127.0.0.1", port: 5173,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api") {
      if (request.method !== "POST" || !request.headers.get("content-type")?.startsWith("application/json")
        || request.headers.get("sec-fetch-site") === "cross-site") return new Response("Forbidden", { status: 403 });
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return new Response("Forbidden", { status: 403 });
      try {
        const raw = await request.text();
        if (raw.length > 65_000) throw new Error("The selection is too large.");
        const value: unknown = JSON.parse(raw);
        if (!isRecord(value)) throw new Error("Invalid request.");
        let data: unknown;
        switch (value.kind) {
          case "preferences": data = await store.preferences(); break;
          case "update-preferences": data = await store.updatePreferences(value.value); break;
          case "translate":
            if (typeof value.text !== "string" || !isLanguage(value.target)
              || value.provider !== undefined && !isProvider(value.provider)) throw new Error("Invalid translation request.");
            data = await translator.translate({ text: value.text, target: value.target, provider: value.provider });
            break;
          case "open-settings": data = null; break;
          default: throw new Error("Use the extension's settings page to manage keys.");
        }
        return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return Response.json({ ok: false, code: error instanceof TranslationError ? error.code : "configuration", message: error instanceof Error ? error.message : "Translation could not finish." });
      }
    }
    if (url.pathname === "/demo.js") return new Response(Bun.file(resolve(root, ".preview/demo.js")), { headers: { "Content-Type": "application/javascript" } });
    if (url.pathname === "/demo.css") return new Response(Bun.file(resolve(root, "demo/demo.css")));
    if (url.pathname === "/playground.js") return new Response(Bun.file(resolve(root, "demo/playground.js")), { headers: { "Content-Type": "application/javascript" } });
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (url.pathname !== "/" && url.pathname !== "/fixture" && url.pathname !== "/test-page.html") return new Response("Not found", { status: 404 });
    const style = url.searchParams.get("style") ?? "editorial";
    let html = (await Bun.file(resolve(root, "demo/test-page.html")).text()).replace('data-style="editorial"', `data-style="${styles.has(style) ? style : "editorial"}"`);
    if (url.pathname === "/") html = html.replace("</body>", '<script src="/demo.js" defer></script></body>');
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});
console.info(`Shvyd live demo: ${server.url}`);
