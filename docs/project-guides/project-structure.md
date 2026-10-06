# Project Structure

Use this structure as a direction, not as a requirement to create empty folders.
Add a folder when the code needs it. The guide works for web apps, browser
extensions, workers, CLIs, and libraries, with or without a UI framework.

## Main idea

- Keep entry points thin. They connect the runtime to the code and do nothing
  else.
- Put product behavior in `features`, one folder per user-facing capability.
- Put rules, data shapes, and services that more than one feature needs in
  `domain`.
- Put reusable presentation building blocks in `ui`.
- Put environment, constants, and generated configuration in `config`.
- Put small generic helpers with no product knowledge in `utils`.
- Keep tests next to the code they cover.

## Suggested shape

```text
src/
  entries/
    main.ts
    worker.ts

  features/
    feature/
      mountFeature.ts
      components/
      logic/
      types.ts

  domain/
    area/
      area.ts
      createAreaService.ts

  ui/
    atoms/
    molecules/
    organisms/
    layouts/

  config/
    generated/

  utils/
  test/

scripts/
```

## Layers and dependency direction

Imports point down this list, never up:

```text
entries
   ↓
features
   ↓
ui / domain
   ↓
config / utils
```

- Entry points import features and, for wiring, domain services.
- A feature imports `domain`, `ui`, `config`, and `utils`.
- A feature may compose another feature only through that feature's main
  export. It never imports the other feature's internal files.
- `ui` renders what it receives. It does not import `domain` or `features`.
- `domain` never imports `features`, `ui`, or framework or platform APIs.
- `utils` imports nothing from the project except other `utils`.
- `scripts/` may import from `src/`. `src/` never imports from `scripts/`.

When an import would point up, move the shared code down a layer instead.

## Entry points

An entry point is any file the runtime or bundler starts from: an app
bootstrap, a route, a worker, a CLI command, an extension script, or a page
script.

- Keep entry points in `entries/`, or in the folder the framework requires,
  such as `pages/` or `app/`.
- An entry point reads platform APIs, builds dependencies such as storage,
  network, or messaging adapters, and passes them to a feature or service.
- An entry point contains no business rules, validation, or rendering logic.
- A typical entry point is a few lines long:

```ts
import { mountFeature } from '@/features/feature/mountFeature'

mountFeature({ send: (request) => runtime.sendMessage(request) })
```

## Features

A feature is a product capability that a user can see or trigger. Each
feature owns everything that exists only for it: its main export, components,
logic, types, styles, and tests.

- Give each feature one main export that the rest of the code uses, such as
  `mountFeature`, `FeatureContainer`, or `useFeature`. Treat other files as
  private.
- `components/` holds UI pieces used only by this feature.
- `logic/` holds pure calculations, parsing, formatting, and data shaping. Code
  here is the easiest to unit test, so prefer moving behavior into it.
- Keep orchestration (state, effects, event handlers) in the main export or a
  dedicated hook or controller. Keep rendering in views or components that
  receive data and callbacks.
- Prefer explicit discriminated states over combinations of optional flags:

```ts
type FeatureState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: Item[] }
```

When related child features share code, group them under a parent feature:

```text
features/
  parent-feature/
    common/
    feature-a/
    feature-b/
```

Put code in `common/` only when at least two child features use it.

## Domain

`domain` holds the product's business rules and data, independent of how they
are shown.

- Group by business area, not by technical kind. Prefer `domain/billing/` over
  `domain/types/` or `domain/services/`.
- An area holds its types, parsing and validation, services, and data-access
  interfaces.
- Pass side effects in as dependencies, for example `fetch`, storage, clocks, or
  message senders, so tests can replace them.
- Validate untrusted data at boundaries (network responses, storage, messages,
  user input, files) with parse functions that return typed values or throw.
- Keep domain code free of framework and platform APIs so it can run in tests,
  scripts, servers, and workers alike.

## UI

`ui` is the shared design system layer. Use it only for presentation code that
at least two features use. Until then, keep components inside the feature that
owns them.

- `atoms` are small components.
- `molecules` are composed reusable pieces.
- `organisms` are larger reusable sections.
- `layouts` define page and application shells.

UI components receive data and callbacks through props or arguments. They do
not fetch data or hold business rules.

## Config

- Read environment variables in one place and export typed values.
- Keep constants that tune behavior, such as limits, timeouts, and URLs, in
  `config` or next to the single module that uses them.
- Keep generated files in `config/generated/` or next to their only consumer.
  Note in the file or a nearby README which script regenerates it. Exclude
  generated files from formatting.

## Utils

- `utils` holds generic helpers such as type guards and small parsers.
- A helper that knows a product term belongs in `domain`, not `utils`.
- Prefer one function per file, named after the function.

## Readable code

Write code for the next person who reads it, not for the fewest lines.

- Leave a blank line between functions, between top-level declarations, and
  between the logical steps inside a function.
- Always use braces for `if`, `for`, and `while` bodies, even for one line.
- Write one declaration and one assignment per statement.
- Replace nested ternaries with `if` statements or a lookup table.
- Give magic numbers a named constant.
- Extract a named helper when a function does several distinct steps or no
  longer fits on one screen.
- Enforce what tools can enforce. Formatters wrap long lines but do not add
  blank lines, so add those by hand. Turn on linter rules such as `curly`,
  `one-var` (`never`), `no-multi-assign`, and `no-nested-ternary`.

## Imports

- Use the `@/` alias, mapped to `src/*`, for imports that cross folders.
- Use relative imports inside one feature or domain area.
- Import from the module that owns the code. Do not re-export another
  module's API; re-exports hide ownership and invite cycles.
- Avoid barrel files (`index.ts` that only re-exports) unless a package
  boundary needs one.

## Naming conventions

Name files after their primary responsibility or export:

- Component files use PascalCase and match the exported component, for example
  `FeatureView.tsx`.
- Files centered on one function or hook use camelCase and match it, for
  example `useFeature.ts`, `mountFeature.ts`, or `parseFeatureState.ts`.
- Multi-export modules and configuration use kebab-case, for example
  `query-client.ts` or `page-style.ts`.
- Folders use kebab-case.
- Tests and other companion files keep the source file's name and add a
  suffix, for example `parseFeatureState.test.ts` or
  `Feature.PageObject.ts`.
- Entry points and barrels such as `main.ts` and `index.ts` stay lowercase.

Inside TypeScript code, use:

- camelCase for functions, hooks, variables, and object properties.
- PascalCase for components, classes, and types.
- UPPER_SNAKE_CASE for module-level constants when the distinction adds
  clarity.

## Tests

- Put unit tests next to the code: `name.ts` and `name.test.ts`.
- Put shared fixtures, helpers, and browser or end-to-end scripts in
  `src/test/`.
- Test domain and `logic/` code directly. Test features through their main
  export or through the rendered UI.
- Tests import code the same way production code does, including the `@/`
  alias.
- End-to-end tests use Page Objects that hide selectors behind semantic
  methods such as `openSettings()` or `expectSaved()`. Prefer roles, labels,
  and visible text. Add stable test IDs only where those are ambiguous.

## Scripts and static files

- Build, development, code generation, and maintenance scripts live in
  `scripts/` at the repository root.
- Files that ship as-is, such as HTML shells, manifests, fonts, and icons, live
  in `public/` or a platform folder the build copies from.
- Build configuration lists entry points from `src/entries/` explicitly.

## Unified fix and verification command

Provide two root-level commands:

- `fix` formats the code, applies configured lint fixes, and then runs
  `verify`.
- `verify` runs linting, format checks, type checking, tests, the build, and any
  project-specific validation. It exits non-zero on the first failure, or after
  running every check when they run in parallel.

CI runs the same `verify` steps so local and CI results agree.

## Moving an existing project to this structure

1. Move files first without changing behavior. Use `git mv` so history follows
   each file.
2. Update build entry points, test globs, lint and format paths, ignore files,
   CI, and documentation that mention old paths.
3. Run `verify`, then exercise the running application once.
4. Split large modules in later, separate changes, each one verified.
