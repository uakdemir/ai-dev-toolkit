# Mobile Scaffold Integration — Design Spec

**Date:** 2026-04-16
**Status:** Design approved (all six sections), ready for implementation planning
**Target skills:** `ai-dev-tools:scaffold` (primary)
**Stack source-of-truth:** `tmp/2026-04-16-mobile-stack-decisions-design.md`
**Recommended IDE:** VS Code (Claude Code integration + Expo Tools extension)

---

## Problem Statement

The user is standardizing on a single React Native + Expo + Supabase stack
(`tmp/2026-04-16-mobile-stack-decisions-design.md`) for all future mobile apps.
The existing `ai-dev-tools:scaffold` skill ships only one stack
(`node-fastify-react`) and assumes a pnpm/turborepo monorepo layout with
internal `packages/<name>/` workspaces. Expo apps are different in three ways
that the current scaffold cannot express:

1. **Single-package layout.** An Expo app is one source tree, not a monorepo.
   There is no `packages/` directory and no per-package `CLAUDE.md` boundary.
2. **No traditional backend package.** Server logic lives in Supabase (managed
   Postgres + Auth + Storage + Realtime + Edge Functions). The "package" Claude
   needs governance for is an SDK boundary (RevenueCat, PostHog, OneSignal,
   Branch.io, Adjust, Sentry, i18n, deep linking) — not a workspace package.
3. **Project bootstrap is owned by Expo CLI.** `npx create-expo-app` writes the
   skeleton (App.tsx, app.json, eas.json, babel.config.js, tsconfig.json,
   package.json). The scaffold should not duplicate or fight this — it should
   layer AI governance files on top of an existing Expo skeleton.

This spec generalises the scaffold skill so it can host the Expo stack as a
first-class citizen alongside the existing `node-fastify-react` stack, and
introduces a clean ownership split (`CLAUDE.md` scaffold-owned, `CLAUDE.local.md`
user-owned) so refresh-on-template-update is safe and non-destructive.

---

## Goals

1. **Add `expo` as a first-class scaffold stack** with templates that match
   single-package Expo conventions and the standardised mobile tool stack.
2. **Make `--stack` mandatory unless a manifest already pins it**, with a fixed
   allowlist `["node-fastify-react", "dotnet-mvc-react", "expo"]`.
3. **Decouple the scaffold from monorepo assumptions** so Expo's single-package
   layout and the existing monorepo layout both work without forking the skill.
4. **Adopt the `CLAUDE.md` (owned) + `CLAUDE.local.md` (user) split** so users
   can extend AI guidance without merging into scaffold-owned files.
5. **Preserve standalone usability** of `--bootstrap` and `--add-package` for
   the existing `node-fastify-react` stack; behaviour for that stack does not
   change except for the mandatory-`--stack` ergonomics.
6. **Two-step workflow for mobile bootstrap**: user runs `create-expo-app`
   first, then runs scaffold to add AI governance on top — no Expo skeleton
   duplication inside the scaffold.

## Success Criteria

Verifiable conditions that define implementation complete:

1. `npx create-expo-app my-app && cd my-app && /scaffold --bootstrap --stack expo`
   writes only AI governance files (CLAUDE.md, .claude/, hookify rules,
   `lib/<sdk>/CLAUDE.md` placeholders) without touching Expo-owned files.
2. `/scaffold --add-package revenuecat --stack expo` (or inferred from manifest)
   creates `lib/revenuecat/CLAUDE.md` for an SDK boundary, not a
   `packages/revenuecat/` workspace.
3. `/scaffold --bootstrap` with no `--stack` and no manifest exits with a
   usage error listing the allowlist.
4. `/scaffold --bootstrap --stack node-fastify-react` continues to produce the
   pre-existing monorepo layout byte-for-byte (no regressions).
5. `CLAUDE.local.md` is auto-loaded by Claude Code in the same hierarchical
   manner as `CLAUDE.md` (verified empirically — see Verification Gate below).
6. `template_version` field appears in every new `.scaffold-manifest.yaml`,
   and refresh logic detects template drift.

---

## Non-Goals

- **`dotnet-mvc-react` template content.** The slot is reserved in the
  allowlist and a stub `stack.yaml` is created so the dispatch path is wired,
  but the templates themselves are deferred. Picking that stack errors with
  "stack registered, templates pending."
- **Expo project skeleton files.** App.tsx, app.json, eas.json,
  babel.config.js, tsconfig.json, package.json are all owned by
  `create-expo-app` and never written by the scaffold.
- **SDK initialisation code.** `lib/revenuecat/index.ts`, `lib/posthog/index.ts`
  etc. are NOT generated. Only their `CLAUDE.md` governance files are scaffolded.
- **Styling library choice.** No Tailwind/NativeWind/StyleSheet preference
  baked in; left to per-project decision.
- **Test infrastructure.** This plugin project has no test suite and no
  verification gates.
- **CI/CD pipelines.** EAS Build is documented in CLAUDE.md guidance but no
  workflow YAML files are generated.
- **Marketing site / web frontend.** Per the stack decisions doc, those live in
  separate repos. The scaffold is mobile-only for the `expo` stack.

---

## Verification Gate (HARD PREREQUISITE)

Before any implementation work begins, empirically verify:

> **Does Claude Code auto-load `CLAUDE.local.md` in the same hierarchical manner
> as `CLAUDE.md`?** (i.e., walks up directory tree, merges with `CLAUDE.md`
> contents from the same directory)

**Test procedure:**
1. Create a tmp directory with `CLAUDE.md` ("scaffold-owned") and
   `CLAUDE.local.md` ("user-owned") at root, plus a nested folder with both.
2. Start a Claude Code session inside the nested folder.
3. Confirm via `/memory` or by asking Claude what guidance it sees that BOTH
   files at BOTH levels are loaded.

**Outcome paths:**
- **Confirmed:** Proceed with the spec as written. The scaffold/user split
  uses `CLAUDE.md` + `CLAUDE.local.md` directly.
- **Not confirmed (only `CLAUDE.md` auto-loads):** Switch to an alternate
  ownership scheme — scaffold writes its content to `CLAUDE.scaffold.md`
  and writes a thin `CLAUDE.md` that references both `CLAUDE.scaffold.md`
  and `CLAUDE.local.md` using whatever inclusion mechanism Claude Code
  actually supports (verbatim include, file pointer, or instructional
  reference, in that order of preference). The thin `CLAUDE.md` becomes
  the user-owned file in this fallback. Sections 1, 5, and the manifest
  schema must be updated to reflect the chosen mechanism before
  implementation.

This gate is non-negotiable. The whole refresh story collapses if the loading
behaviour is misunderstood.

---

# Section 1 — Architecture Overview

## Layout (single-package Expo)

```
<expo-app-root>/
├── app/                      # Expo Router routes (Expo-owned)
├── assets/                   # Expo-owned
├── lib/                      # SDK + utility boundaries (scaffold-owned governance)
│   ├── revenuecat/
│   │   └── CLAUDE.md         # scaffold-owned
│   ├── posthog/
│   │   └── CLAUDE.md
│   ├── onesignal/
│   │   └── CLAUDE.md
│   ├── branch/
│   │   └── CLAUDE.md
│   ├── adjust/
│   │   └── CLAUDE.md
│   ├── sentry/
│   │   └── CLAUDE.md
│   ├── i18n/
│   │   └── CLAUDE.md
│   └── supabase/
│       └── CLAUDE.md
├── features/                 # User-created via /scaffold --add-package
│   └── <name>/
│       ├── CLAUDE.md         # scaffold-owned (write_once)
│       └── CLAUDE.local.md   # optional user notes (never written)
├── .claude/
│   ├── settings.json         # scaffold-owned, deep-merged from root + technology layers
│   ├── hotspots.md           # scaffold-owned
│   └── hookify.*.local.md    # scaffold-owned hookify rules (mobile-tuned)
├── CLAUDE.md                 # scaffold-owned (root governance)
├── CLAUDE.local.md           # user-owned (never written, never overwritten)
└── .scaffold-manifest.yaml   # scaffold-owned
```

## Ownership rules

| Path | Owner | Refresh behaviour |
|---|---|---|
| `CLAUDE.md` (any level) | Scaffold | Overwritten on `--force` refresh |
| `CLAUDE.local.md` (any level) | User | Never written, never read by scaffold |
| `.claude/settings.json` | Scaffold | Overwritten on `--force` refresh |
| `.claude/hookify.*.local.md` | Scaffold | Overwritten on `--force` refresh |
| `lib/<sdk>/CLAUDE.md` | Scaffold | Overwritten on `--force` refresh |
| `features/<name>/CLAUDE.md` | Scaffold (write_once) | Created once on add-package, never refreshed |
| Everything else (app code, configs, package.json, etc.) | User / Expo | Scaffold never touches |

## Key architectural decisions

- **Folder-as-module pattern.** Without a monorepo to provide per-package
  CLAUDE.md boundaries, governance lives in `lib/<sdk>/CLAUDE.md` and
  `features/<name>/CLAUDE.md`. Claude Code's hierarchical CLAUDE.md loading
  walks the tree and applies the deepest match.
- **SDK boundary, not workspace boundary.** `lib/<sdk>/` is a directory of
  source files, not a separately-installed npm package. The CLAUDE.md inside
  it documents how to call the SDK, where the auth token lives, what the
  surrounding policy is.
- **Features carved by add-package.** When the user adds a domain feature
  ("matching", "messaging", "profile"), `--add-package <name>` writes
  `features/<name>/CLAUDE.md` once. Subsequent refreshes skip it
  (`write_once: true` in the manifest).

`★ Insight ─────────────────────────────────────`
- Folder-as-module gives you scoped guidance without paying for a workspace
  setup. The price is that imports across folders use relative paths — fine
  while the app is small, mildly annoying past ~50 modules.
- The `CLAUDE.md` / `CLAUDE.local.md` split mirrors how `.gitignore` /
  `.gitignore.local` patterns work in many tools: shared file is owned and
  refreshable, local file is owned by the developer and never overwritten.
`─────────────────────────────────────────────────`

---

# Section 2 — Workflow

Three workflows, scaled to lifecycle stage:

## A. Bootstrap (new project)

```
npx create-expo-app my-app
cd my-app
/scaffold --bootstrap --stack expo
```

- `create-expo-app` writes Expo skeleton (App.tsx, app.json, eas.json,
  babel.config.js, tsconfig.json, package.json, .gitignore).
- `/scaffold --bootstrap --stack expo` writes ONLY:
  - Root `CLAUDE.md`
  - `.claude/settings.json` (root + technology layers deep-merged)
  - `.claude/hotspots.md`
  - `.claude/hookify.*.local.md` (mobile-tuned rules)
  - All eight `lib/<sdk>/CLAUDE.md` placeholders
  - `.scaffold-manifest.yaml` listing every file written
- Bootstrap fails if Expo skeleton is not detected (no `app.json` and no
  `package.json` with `expo` dependency) → error: "Run `create-expo-app`
  first, then re-run `/scaffold --bootstrap --stack expo`."

## B. Add-package (during development)

```
/scaffold --add-package matching
```

- Stack is inferred from `.scaffold-manifest.yaml` (`stack: expo`). For
  `expo` stack, this writes `features/matching/CLAUDE.md` (write_once).
- For `node-fastify-react` stack, behaviour is unchanged — writes
  `packages/matching/CLAUDE.md` and `packages/matching/.claude/settings.json`.
- Per-stack `target_dir` mapping is defined in the stack's `stack.yaml`.

## C. Refresh on template update

```
/scaffold --bootstrap --force
```

- Re-applies templates over an existing scaffolded project.
- `template_version` in the manifest is compared against the current
  template's version. If they differ, scaffold prints a summary of changed
  files (using diff against current contents) and asks for confirmation.
- Only files listed in the manifest are touched.
- `write_once` files (anything in `features/`) are skipped automatically.
- `CLAUDE.local.md` files are never touched (they are not in the manifest).
- After successful refresh, the manifest's `template_version` is updated.

`★ Insight ─────────────────────────────────────`
- The two-step bootstrap (create-expo-app → scaffold) keeps responsibilities
  clean: Expo CLI owns the runtime skeleton; scaffold owns AI governance.
  No template drift between scaffold's idea of "App.tsx" and Expo's current
  default.
- `--add-package` doing different things per stack is intentional — it's the
  same UX ("add a thing the project should be aware of") expressed in each
  stack's natural unit (workspace package vs feature folder).
`─────────────────────────────────────────────────`

---

# Section 3 — Template Content Outline

## Root layer (`templates/expo/root/`)

### `CLAUDE.md` (root)
- Project overview placeholder
- Stack summary (Expo + Supabase + 8 SDKs)
- Reference to `tmp/2026-04-16-mobile-stack-decisions-design.md` style doc
  (linked, not embedded — single source of truth)
- Folder-as-module convention explanation
- Pointer to `lib/<sdk>/CLAUDE.md` for per-SDK guidance
- "Read `CLAUDE.local.md` if present" trailer line
- Mobile-specific defaults: TypeScript strict, Expo Router file conventions,
  no native code without `expo prebuild`

### `.claude/settings.json` (root)
- `permissions` defaults
- `hooks` (PostToolUse for typecheck via `npx tsc --noEmit` against
  `tsconfig.json` at root)
- `network.allowedHosts`: `expo.dev`, `docs.expo.dev`, `react.dev`,
  `reactnative.dev`, `supabase.com`, `posthog.com`, `revenuecat.com`,
  `onesignal.com`, `branch.io`, `adjust.com`, `sentry.io`, `bunny.net`,
  `crowdin.com`, `deepl.com`

### `.claude/hotspots.md`
- Common edit hotspots: `app/`, `lib/<sdk>/`, `features/<name>/`

### `.claude/hookify.*.local.md` (eight rules, mobile-tuned)
1. `block-git-operations` — blocks destructive git from Claude
2. `warn-native-edits` — warns when Claude tries to edit `ios/` or
   `android/` (means user needs prebuild flow)
3. `warn-app-json-edits` — flags `app.json` edits since they need EAS rebuild
4. `block-secret-commits` — blocks committing files matching
   `*secret*`, `*.env`, `eas.json` with hardcoded creds
5. `warn-package-json-deps` — flags direct `package.json` edits without
   `expo install` (Expo wraps install for SDK compat resolution)
6. `warn-supabase-migration-skip` — flags Supabase schema changes without a
   migration file
7. `block-eas-build-without-confirm` — blocks `eas build` from Claude
   without user confirmation
8. `warn-aso-store-listing-edits` — flags edits to store listing assets

## Package layer (`templates/expo/package/`)

For `expo` stack, the package layer writes ONE file per add-package call:
- `features/<name>/CLAUDE.md` (write_once, marked in manifest)

Contents: feature scope description, expected file structure
(`<name>.screen.tsx`, `<name>.store.ts`, `<name>.types.ts`),
links to relevant `lib/<sdk>/` modules.

## Technology layer (`templates/expo/technology/`)

### `technology/CLAUDE.md`
Appended to root `CLAUDE.md` after substitution. Covers:
- Expo Router patterns (file-based routing, layouts, dynamic routes)
- Supabase usage patterns (client init, RLS expectations, Edge Functions)
- React Query + Zustand state conventions
- i18n via expo-localization + i18next
- Push notification flow (OneSignal → user, RevenueCat webhooks → OneSignal)
- Deep link flow (Branch.io for deferred, Expo Linking for in-app)
- Crash + error monitoring (Sentry config plugin)
- Build/release flow (EAS Build, EAS Update for OTA)

### `technology/.claude/settings.json`
- Expo-specific PostToolUse hooks
- Additional `network.allowedHosts` for Expo docs and SDK provider docs

### `technology/lib/<sdk>/CLAUDE.md` (eight files)
Each placeholder describes:
- What the SDK is for in this stack
- Where the API key/token is configured
- The 1-2 canonical usage patterns
- What NOT to do (e.g., "don't call RevenueCat from outside `lib/revenuecat/`")
- Pointer to provider docs

The eight SDKs:
`revenuecat`, `posthog`, `onesignal`, `branch`, `adjust`, `sentry`,
`i18n` (expo-localization + i18next), `supabase`.

`★ Insight ─────────────────────────────────────`
- The technology layer's `lib/<sdk>/CLAUDE.md` files mirror the same merge
  pattern as `node-fastify-react`'s technology layer: technology layer
  files land in the user's project alongside root layer files.
- Mobile-tuned hookify rules are the highest-leverage scaffold feature for
  this stack — mobile has more "you'll regret this in production" footguns
  (native edits, store listing changes, EAS builds) than typical web work.
`─────────────────────────────────────────────────`

---

# Section 4 — Scaffold Skill Modifications

Six changes to `ai-dev-tools:scaffold`:

## Change 1 — Introduce `stack.yaml` per stack

Each stack directory gets a `stack.yaml` describing its capabilities:

```yaml
# templates/expo/stack.yaml
name: expo
display_name: Expo (React Native)
layout: single-package          # vs "monorepo"
add_package_target_dir: features
package_dir_creates_settings: false   # only writes CLAUDE.md
bootstrap_prereq:
  any_of:
    - file_exists: app.json
    - package_json_dependency: expo
  error_message: "Run `npx create-expo-app` first, then re-run scaffold."
template_version: 1.0.0
```

```yaml
# templates/node-fastify-react/stack.yaml
name: node-fastify-react
display_name: Node.js + Fastify + React
layout: monorepo
add_package_target_dir: packages
package_dir_creates_settings: true
bootstrap_prereq: null
template_version: 1.0.0
```

```yaml
# templates/dotnet-mvc-react/stack.yaml  (STUB)
name: dotnet-mvc-react
display_name: .NET MVC + React
status: registered_templates_pending
error_on_select: "stack registered, templates pending"
template_version: 0.0.0
```

## Change 2 — Mandatory `--stack` (with manifest fallback)

- `--stack` is REQUIRED on `--bootstrap` unless the cwd already has a
  `.scaffold-manifest.yaml` pinning a stack (in which case `--bootstrap --force`
  reuses the pinned stack).
- `--add-package` reads stack from manifest. Manifest missing → error:
  "Not a scaffolded project. Run `--bootstrap --stack <name>` first."
- Allowlist: `["node-fastify-react", "dotnet-mvc-react", "expo"]`. Any other
  value → error listing valid options.
- Removes the previous default `node-fastify-react` behaviour. **Breaking
  change** — acceptable per user direction at this stage.

## Change 3 — Generalised technology layer mirroring

Currently the technology layer assumes `node-fastify-react` shape. Generalise:
- Read `templates/<stack>/stack.yaml` to determine which technology layer
  conventions apply.
- Technology layer can write into arbitrary subdirectories (not just root).
  Specifically, `templates/expo/technology/lib/<sdk>/CLAUDE.md` files mirror
  to `<project>/lib/<sdk>/CLAUDE.md`.
- Existing `technology/CLAUDE.md` append + `.claude/settings.json` deep-merge
  rules stay unchanged.

## Change 4 — Per-stack `--add-package`

Behaviour now switches on `stack.yaml.add_package_target_dir`:
- `node-fastify-react`: writes `packages/<name>/CLAUDE.md` and
  `packages/<name>/.claude/settings.json` (existing behaviour).
- `expo`: writes `features/<name>/CLAUDE.md` only, marks `write_once: true`
  in the manifest entry.

Validation:
- `node-fastify-react`: monorepo root check via `pnpm-workspace.yaml` or
  `turbo.json` (existing).
- `expo`: project root check via `app.json` or `package.json[dependencies.expo]`.

## Change 5 — `template_version` in manifest + structured file entries

**Schema change (breaking for existing manifests):** `files:` entries become
objects (so they can carry per-file flags like `write_once`) instead of bare
strings. Existing `node-fastify-react` manifests written under the old schema
must be migrated. Migration logic: on the first `--bootstrap --force` or
`--add-package` call against a project with an old-format manifest, the
scaffold rewrites the manifest in the new schema, infers
`template_version: 1.0.0` for `node-fastify-react` (its initial version),
and prints a one-line notice.

```yaml
# .scaffold-manifest.yaml (new schema)
stack: expo
template_version: 1.0.0
created: 2026-04-16T10:23:00Z
files:
  - path: CLAUDE.md
  - path: .claude/settings.json
  - path: features/matching/CLAUDE.md
    write_once: true
```

- Bootstrap writes `template_version` from `stack.yaml` at scaffold time.
- Refresh compares against current `stack.yaml.template_version`. On
  mismatch, prints summary of changed files before applying.
- Add-package preserves existing `template_version` — only bootstrap-with-force
  bumps it.

## Change 6 — `CLAUDE.md` / `CLAUDE.local.md` ownership convention

- Every scaffold-written `CLAUDE.md` ends with the trailer:

  ```markdown
  ---
  Project-specific or personal AI guidance not managed by the scaffold lives
  in `CLAUDE.local.md` next to this file. Read it if present.
  ```

- `CLAUDE.local.md` files are NEVER written by the scaffold and NEVER appear
  in the manifest.
- Refresh logic ignores any `CLAUDE.local.md` it encounters.
- This convention applies to ALL stacks (not just expo) — it's a general
  scaffold improvement.

`★ Insight ─────────────────────────────────────`
- Mandatory `--stack` (Change 2) is a small breaking change but eliminates a
  whole class of "wrong stack got scaffolded" mistakes. The error-with-allowlist
  pattern is also self-documenting for new users.
- Reserving `dotnet-mvc-react` as a stub (Change 1) means the dispatch path
  is exercised end-to-end before any .NET template work begins. Future work
  is "fill the templates", not "wire up a new stack."
`─────────────────────────────────────────────────`

---

# Section 5 — Iteration Model

## Versioning

Each `templates/<stack>/stack.yaml` carries a `template_version: X.Y.Z`:

| Bump | Trigger |
|---|---|
| Patch (1.0.0 → 1.0.1) | Typo fixes, small wording in CLAUDE.md, hookify rule tweaks |
| Minor (1.0.0 → 1.1.0) | New `lib/<sdk>/CLAUDE.md` placeholder, new hookify rule, new allowed host |
| Major (1.0.0 → 2.0.0) | Layout change (e.g., `lib/` → `sdks/`), removed file, breaking convention change |

## Refresh workflow

```
/scaffold --bootstrap --force
```

Behaviour:
1. Read manifest. Compare `template_version` to `stack.yaml.template_version`.
2. If equal → "No template updates available. Use `--force` only when you
   want to re-apply current templates."
3. If different → print summary (legend: `M` = modified, `A` = added,
   `D` = deleted/no-longer-in-template, `-` = skipped):
   ```
   Template update: 1.0.0 → 1.1.0
   Changes since your version:
     M   CLAUDE.md                                  (content changed)
     M   .claude/settings.json                      (content changed)
     A   lib/sentry/CLAUDE.md                       (new in 1.1.0)
     A   .claude/hookify.warn-bundle-size.local.md  (new in 1.1.0)
     -   features/matching/CLAUDE.md                (skipped: write_once)
     -   CLAUDE.local.md                            (skipped: user-owned)
   Proceed? [y/N]
   ```
4. On `y` → apply changes, update manifest's `template_version`.
5. On `n` → exit clean, no changes.

No 3-way merge UI. Users with hand-edited scaffold-owned files
(`CLAUDE.md`, `.claude/settings.json`) lose their hand edits — that's the
explicit cost of the ownership split. The CLAUDE.local.md escape valve
exists exactly to prevent this from being a problem in practice.

## Write-once semantics

Manifest entries can carry `write_once: true`:
- `features/<name>/CLAUDE.md` — always write_once
- Any future scaffold-managed-but-user-customised file can use this flag.

Refresh skips write_once files unconditionally and prints them in the
"skipped" list of the summary.

## Major version bumps

When `template_version` major version changes (1.x → 2.x), refresh prints an
extra warning:
```
WARNING: Major template version bump (1.x → 2.x) — layout or convention
changes likely. Review the changelog at:
  ai-dev-tools/skills/scaffold/templates/<stack>/CHANGELOG.md
```

A `CHANGELOG.md` per stack documents what each version added/changed/removed.

`★ Insight ─────────────────────────────────────`
- The `write_once` flag is the lightest possible mechanism for "scaffold
  remembers it created this, but won't touch it again." Avoids a separate
  per-file ownership table.
- Skipping the 3-way merge UI is a deliberate tradeoff: simpler scaffold
  code, simpler mental model, and the CLAUDE.local.md split removes the
  main reason users would hand-edit scaffold-owned files.
`─────────────────────────────────────────────────`

---

# Section 6 — Out of Scope for v1

Explicitly excluded from this implementation:

| Excluded | Reason | Future revisit trigger |
|---|---|---|
| `dotnet-mvc-react` template content | User has no immediate .NET project | First .NET project request |
| Expo project files (App.tsx, app.json, eas.json, babel.config.js, tsconfig.json, package.json) | Owned by `create-expo-app`; duplicating creates drift | Never — keep clean separation |
| SDK initialisation code (`lib/<sdk>/index.ts`) | Each project may want different init patterns; templating it forces premature standardisation | If 3+ projects copy-paste the same init, promote to template |
| Styling library choice (Tailwind, NativeWind, StyleSheet) | Project-specific aesthetic decision | If a strong stack default emerges from real projects |
| Test infrastructure (Vitest, Jest, Detox) | Plugin project itself has no test suite (per user feedback) | Out-of-scope |
| CI/CD workflow files (.github/workflows/) | EAS Build covers most CI needs without YAML; project-specific signing setup | First project that needs custom CI |
| Marketing site / web frontend | Lives in separate repos per stack decisions doc | Out-of-scope for mobile scaffold |
| Multi-stack mixing (e.g., one repo with both `expo` and `node-fastify-react`) | Architecturally messy; manifest assumes single stack | If a real use case appears |
| Migration tool from existing un-scaffolded Expo apps | Manual `--bootstrap --force` over existing app should suffice for now | If users hit this regularly |

---

## Summary

**What this spec does:**
- Generalises `ai-dev-tools:scaffold` to host three stacks via `stack.yaml`
  config files: `node-fastify-react` (existing), `expo` (new), and
  `dotnet-mvc-react` (stub).
- Adds Expo as a single-package stack with eight `lib/<sdk>/CLAUDE.md` files,
  eight mobile-tuned hookify rules, and a `features/<name>/CLAUDE.md`
  pattern for `--add-package`.
- Introduces `CLAUDE.md` (scaffold-owned) + `CLAUDE.local.md` (user-owned)
  split + `template_version` in manifest for clean refresh-on-update.

**Decisions taken:**
- Mandatory `--stack` flag (with manifest fallback) — breaking change accepted.
- Two-step bootstrap: `create-expo-app` first, then `/scaffold --bootstrap --stack expo`.
- Refresh skips 3-way merge in favour of write-once flag + ownership split.

**Hard prerequisite before implementation:** Verify `CLAUDE.local.md`
auto-loading behaviour in Claude Code. If unconfirmed, the spec switches to
the `CLAUDE.scaffold.md` + thin `CLAUDE.md` import pattern (Sections 1, 5,
and the manifest schema all change).
