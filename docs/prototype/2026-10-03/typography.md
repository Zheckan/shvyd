# Fixed popup typography, 2026-10-03

The selection button and translation popup now use a fixed font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif`. Translation text stays at 15 px with normal letter spacing. Page adaptation still samples colors, borders, corner radius, and shadow. No font files are bundled or downloaded.

The T3 collaborative browser loaded all four demo pages. Computed styles on the mounted popup elements showed the same font stack, translation size, and letter spacing for each page, despite their different source fonts:

| Page | Source font | Popup result |
|---|---|---|
| Editorial | Georgia / Times | Fixed system stack, 15 px, normal spacing |
| Technical | SFMono / Consolas | Fixed system stack, 15 px, normal spacing |
| Journal | Arial | Fixed system stack, 15 px, normal spacing |
| Warm | Avenir / Segoe UI | Fixed system stack, 15 px, normal spacing |

The raw observations are in [typography-results.json](typography-results.json). This check inspected computed styles of mounted elements; it did not complete a translation or verify a screenshot. The earlier [Helium runtime report](report.md) remains a record of the original prototype before this typography change.

`bun run check` passed strict TypeScript checking, all seven behavior tests, and the credential-free build. `bun run build:local` then rebuilt the ready-to-load extension with the existing private local provider settings. The live Helium harness now asserts fixed typography across all four page styles, but its full provider run was not repeated for this styling-only change.
