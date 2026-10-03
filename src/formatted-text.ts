import { MAX_SELECTION_LENGTH, type Translation, type TranslationFormat } from "./translation";

type SelectedContent = { text: string; format: TranslationFormat };
const TAGS = new Set([
  "div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "br",
  "strong", "em", "u", "s", "sup", "sub", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "dl", "dt", "dd",
]);
const OMIT = new Set([
  "script", "style", "noscript", "template", "svg", "math", "img", "iframe", "object", "embed",
  "link", "meta", "input", "select", "textarea", "canvas", "video", "audio",
]);
const BLOCKS = "p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,pre,blockquote,table,tr,th,td,dl,dt,dd";
const MAX_NODES = 4_000;
const MAX_DEPTH = 40;

function numberAttribute(element: Element, name: string): number | undefined {
  const value = element.getAttribute(name);
  return value !== null && /^-?\d{1,6}$/.test(value) ? Number(value) : undefined;
}

function safeElement(source: Element, tag: string, preserveCode: boolean): HTMLElement {
  const result = document.createElement(tag);
  for (const name of tag === "ol" ? ["start"] : tag === "li" ? ["value"] : tag === "td" || tag === "th" ? ["colspan", "rowspan"] : []) {
    const value = numberAttribute(source, name);
    if (value !== undefined && (!name.endsWith("span") || value >= 1 && value <= 100)) result.setAttribute(name, String(value));
  }
  if (tag === "ol" && source.hasAttribute("reversed")) result.setAttribute("reversed", "");
  if (preserveCode && (tag === "pre" || tag === "code")) {
    result.setAttribute("translate", "no");
    result.className = "notranslate";
  }
  return result;
}

function tagName(element: Element): string {
  const tag = element.localName.toLowerCase();
  return tag === "b" ? "strong" : tag === "i" ? "em" : tag === "strike" || tag === "del" ? "s" : tag;
}

/** Copy only selected text and inert formatting. Page attributes never enter the request. */
export function captureSelection(range: Range, plainText: string): SelectedContent {
  const fallback: SelectedContent = { text: plainText, format: "plain" };
  const container = document.createElement("div");
  let visited = 0;
  try {
    let source = range.commonAncestorContainer;
    if (source instanceof Text) source = source.parentElement ?? source;
    if (source instanceof Element) {
      source = source.closest(BLOCKS) ?? source;
      if (source instanceof Element) source = source.closest("table") ?? source.closest("ul,ol") ?? source;
    }
    function copy(node: Node, parent: Node, depth: number): void {
      if (++visited > MAX_NODES || depth > MAX_DEPTH) throw new Error("Selection structure is too large.");
      if (!range.intersectsNode(node)) return;
      if (node instanceof Text) {
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.length;
        parent.appendChild(document.createTextNode(node.data.slice(start, end)));
        return;
      }
      if (!(node instanceof Element)) return;
      let tag = tagName(node);
      if (OMIT.has(tag)) return;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return;
      if (!TAGS.has(tag) && !style.display.startsWith("inline") && style.display !== "contents") tag = "div";
      const output = TAGS.has(tag) ? safeElement(node, tag, true) : document.createDocumentFragment();
      if (tag === "ol") {
        const items = [...node.children].filter(child => child.localName === "li");
        const step = node.hasAttribute("reversed") ? -1 : 1;
        let value = numberAttribute(node, "start") ?? (step === -1 ? items.length : 1);
        for (const item of items) {
          if (++visited > MAX_NODES) throw new Error("Selection structure is too large.");
          value = numberAttribute(item, "value") ?? value;
          if (range.intersectsNode(item)) { if (output instanceof Element) output.setAttribute("start", String(value)); break; }
          value += step;
        }
      }
      for (const child of node.childNodes) copy(child, output, depth + 1);
      if (tag === "br" || output.textContent?.trim()) parent.appendChild(output);
    }
    copy(source, container, 0);
    // A complete wrapper is required by Azure. Excess markup falls back to the bounded plain selection.
    const html = container.outerHTML;
    if (!container.childElementCount || html.length > MAX_SELECTION_LENGTH) return fallback;
    return { text: html, format: "html" };
  } catch { return fallback; }
}

function readableText(node: Node): string {
  if (node instanceof Text) return node.data;
  if (!(node instanceof Element)) return [...node.childNodes].map(readableText).join("");
  const tag = node.localName;
  if (tag === "br") return "\n";
  if (tag === "ul" || tag === "ol") {
    const items = [...node.children].filter(child => child.localName === "li");
    const step = node.hasAttribute("reversed") ? -1 : 1;
    let value = numberAttribute(node, "start") ?? (step === -1 ? items.length : 1);
    return "\n" + items.map(item => {
      value = numberAttribute(item, "value") ?? value;
      const marker = tag === "ol" ? `${value}. ` : "• ";
      value += step;
      return marker + readableText(item).trim();
    }).join("\n") + "\n\n";
  }
  if (tag === "tr") return [...node.children].map(child => readableText(child).trim()).join("\t") + "\n";
  const text = [...node.childNodes].map(readableText).join("");
  return node.matches("p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,dl,dt,dd,table") ? text + "\n\n" : text;
}

/** Provider HTML is untrusted. Parse in an inert template, then create allowed nodes afresh. */
export function renderTranslation(output: HTMLElement, translation: Pick<Translation, "text" | "format">): string {
  output.classList.toggle("formatted", translation.format === "html");
  if (translation.format === "plain") {
    output.textContent = translation.text;
    return translation.text;
  }
  const template = document.createElement("template");
  template.innerHTML = translation.text;
  const fragment = document.createDocumentFragment();
  let visited = 0;
  function copy(node: Node, parent: Node, depth: number): void {
    if (++visited > MAX_NODES || depth > MAX_DEPTH) throw new Error("The translation structure is too large.");
    if (node instanceof Text) { parent.appendChild(document.createTextNode(node.data)); return; }
    if (!(node instanceof Element)) return;
    const tag = tagName(node);
    if (OMIT.has(tag)) return;
    const safe = TAGS.has(tag) ? safeElement(node, tag, false) : document.createDocumentFragment();
    for (const child of node.childNodes) copy(child, safe, depth + 1);
    parent.appendChild(safe);
  }
  for (const node of template.content.childNodes) copy(node, fragment, 0);
  const text = readableText(fragment).replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("The provider returned an empty translation.");
  output.replaceChildren(fragment);
  return text;
}
