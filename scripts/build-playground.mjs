import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [template, css, javascript] = await Promise.all([
  readFile(resolve(root, "demo/test-page.html"), "utf8"),
  readFile(resolve(root, "demo/demo.css"), "utf8"),
  readFile(resolve(root, "demo/playground.js"), "utf8"),
]);
const stylesheet = '<link rel="stylesheet" href="demo.css">';
const script = '<script src="playground.js" defer></script>';
if (!template.includes(stylesheet) || !template.includes(script) || !template.includes("</body>")) {
  throw new Error("The playground template is missing its stylesheet, controls, or body.");
}
const html = template
  .replace(stylesheet, `<style>\n${css}\n</style>`)
  .replace(script, "")
  .replace("</body>", `<script>\n${javascript.replace(/<\/script/gi, "<\\/script")}\n</script>\n</body>`);
const directory = resolve(root, "dist");
const output = resolve(directory, "playground.html");
await mkdir(directory, { recursive: true });
await writeFile(output, html);
console.info(`Built standalone test page: ${output}`);
console.info("Open playground.html in your Chromium browser. Reload Shvyd and enable Allow access to file URLs in its Details to translate local selections.");
