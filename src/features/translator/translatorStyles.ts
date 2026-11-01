export const TRANSLATOR_STYLES = `
  :host {
    all: initial;
  }
  :host::backdrop {
    background: transparent;
    pointer-events: none;
  }
  * {
    box-sizing: border-box;
  }
  [hidden] {
    display: none !important;
  }
  button,
  input {
    font: inherit;
    color: inherit;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--shvyd-accent);
    outline-offset: 3px;
  }
  .bubble,
  .panel,
  .language-menu {
    position: fixed;
    color: var(--shvyd-foreground);
    background: var(--shvyd-background);
    border: 1px solid var(--shvyd-border);
    box-shadow: var(--shvyd-shadow);
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
      system-ui, sans-serif;
    letter-spacing: normal;
    color-scheme: var(--shvyd-scheme, normal);
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--shvyd-foreground) 28%, transparent)
      transparent;
  }
  .bubble {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 11px;
    border-radius: max(4px, var(--shvyd-radius));
    font-size: 13px;
    line-height: 18px;
    white-space: nowrap;
  }
  .bubble svg {
    color: var(--shvyd-accent);
  }
  .panel {
    width: min(410px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    border-radius: var(--shvyd-radius);
    overflow: auto;
    overscroll-behavior: contain;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 6px 15px;
    border-bottom: 1px solid transparent;
    transition: border-color 150ms ease-out;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  /* Scrolled text now passes under the toolbar, so mark where it ends. */
  .panel[data-above] .toolbar {
    border-bottom-color: var(--shvyd-border);
  }
  .toolbar.dragging {
    cursor: grabbing;
  }
  .target {
    min-width: 0;
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    background: transparent;
    font-size: 12px;
    padding: 4px 2px;
    color: var(--shvyd-accent);
    cursor: pointer;
  }
  .language-menu {
    z-index: 1;
    width: min(280px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    overflow: auto;
    overscroll-behavior: contain;
    padding: 8px;
    border-radius: max(4px, var(--shvyd-radius));
  }
  .language-list {
    max-height: 170px;
    overflow: auto;
    overscroll-behavior: contain;
    font-size: 12px;
  }
  .language-option {
    display: block;
    width: 100%;
    border: 0;
    background: transparent;
    padding: 8px;
    text-align: start;
    border-radius: 4px;
    font-size: 12px;
  }
  .language-option:hover,
  .language-option[aria-selected="true"] {
    background: color-mix(in srgb, var(--shvyd-foreground) 8%, transparent);
  }
  .more-languages {
    border: 0;
    border-top: 1px solid var(--shvyd-border);
    width: 100%;
    text-align: start;
    padding: 10px 8px 2px;
    background: transparent;
    color: var(--shvyd-accent);
    font-size: 12px;
  }
  .language-search {
    width: 100%;
    border: 1px solid var(--shvyd-border);
    background: var(--shvyd-background);
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
    margin: 8px 0;
  }
  .language-search:focus-visible {
    outline: 2px solid var(--shvyd-accent);
    outline-offset: 1px;
  }
  .spacer {
    flex: 1;
    min-width: 24px;
    align-self: stretch;
  }
  .icon {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 4px;
    padding: 4px;
    opacity: 0.65;
  }
  .icon:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--shvyd-foreground) 7%, transparent);
  }
  .icon:disabled {
    opacity: 0.25;
    cursor: default;
  }
  svg {
    display: block;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .translation {
    padding: 6px 17px 18px;
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    text-align: start;
    user-select: text;
    max-height: min(55dvh, 480px);
    overflow: auto;
    /*
     * Lines fade out at an edge that hides more text instead of being cut.
     * Layers, top first: the two scrollbar strips stay opaque and are added to
     * the top fade intersected with the bottom fade. Each fade is 28 px taller
     * than the box and starts shifted out of view; sliding it in shows the fade.
     */
    mask-image:
      linear-gradient(#000, #000), linear-gradient(#000, #000),
      linear-gradient(to bottom, transparent, #000 28px),
      linear-gradient(to top, transparent, #000 28px);
    mask-size:
      14px 100%,
      14px 100%,
      100% calc(100% + 28px),
      100% calc(100% + 28px);
    mask-repeat: no-repeat;
    mask-composite: add, add, intersect, add;
    mask-position:
      left top,
      right top,
      left 0 top -28px,
      left 0 bottom -28px;
    transition: mask-position 150ms ease-out;
  }
  .panel[data-above] .translation {
    mask-position:
      left top,
      right top,
      left 0 top 0,
      left 0 bottom -28px;
  }
  .panel[data-below] .translation {
    mask-position:
      left top,
      right top,
      left 0 top -28px,
      left 0 bottom 0;
  }
  .panel[data-above][data-below] .translation {
    mask-position:
      left top,
      right top,
      left 0 top 0,
      left 0 bottom 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .toolbar,
    .translation {
      transition: none;
    }
  }
  .translation.formatted {
    white-space: normal;
  }
  .formatted p,
  .formatted h1,
  .formatted h2,
  .formatted h3,
  .formatted h4,
  .formatted h5,
  .formatted h6,
  .formatted pre,
  .formatted table,
  .formatted dl {
    margin: 0 0 0.8em;
  }
  .formatted h1,
  .formatted h2,
  .formatted h3,
  .formatted h4,
  .formatted h5,
  .formatted h6 {
    font-size: 1em;
    font-weight: 650;
    line-height: 1.5;
  }
  .formatted strong,
  .formatted th,
  .formatted dt {
    font-weight: 650;
  }
  .formatted u {
    text-decoration-line: underline;
  }
  .formatted ul,
  .formatted ol {
    padding-inline-start: 1.5em;
    margin: 0 0 0.8em;
  }
  .formatted li + li {
    margin-block-start: 0.35em;
  }
  .formatted li > ul,
  .formatted li > ol {
    margin-block: 0.35em 0;
  }
  .formatted div + div {
    margin-block-start: 0.8em;
  }
  .formatted blockquote {
    margin: 0 0 0.8em;
    padding-inline-start: 12px;
    border-inline-start: 2px solid var(--shvyd-border);
  }
  .formatted pre,
  .formatted code {
    font: inherit;
    white-space: pre-wrap;
  }
  .formatted pre {
    padding: 8px 10px;
    border: 1px solid var(--shvyd-border);
    border-radius: 4px;
  }
  .formatted table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .formatted td,
  .formatted th {
    border: 1px solid var(--shvyd-border);
    padding: 6px 8px;
    text-align: start;
    vertical-align: top;
  }
  .formatted dd {
    margin-inline-start: 1em;
  }
  .formatted :last-child {
    margin-block-end: 0;
  }
  .status {
    padding: 0 17px 16px;
    font-size: 13px;
    line-height: 1.5;
  }
  .actions {
    padding: 0 17px 16px;
    display: flex;
    gap: 14px;
  }
  .text-button {
    border: 0;
    padding: 0;
    background: transparent;
    text-decoration: underline;
    text-underline-offset: 3px;
    color: var(--shvyd-accent);
    font-size: 13px;
  }
  /* Same box as .translation: each placeholder line takes one 24 px text line. */
  .loading {
    padding: 6px 17px 18px;
  }
  .line {
    height: 10px;
    margin: 7px 0;
    border-radius: 3px;
    background: color-mix(in srgb, var(--shvyd-foreground) 10%, transparent);
  }
  /* Padding from .status would otherwise make the panel scroll while loading. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    border: 0;
    overflow: hidden;
    white-space: nowrap;
    clip-path: inset(50%);
  }
`
