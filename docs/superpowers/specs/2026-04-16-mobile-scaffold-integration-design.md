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

1. `npx create-expo-app my-app && cd my-app && /scaffold --bootstrap --stack expo --force`
   writes only AI governance files (CLAUDE.md, .claude/, hookify rules,
   `lib/<sdk>/CLAUDE.md` placeholders) without touching Expo-owned files.
2. `/scaffold --add-package revenuecat` (or inferred from manifest)
   creates `features/revenuecat/CLAUDE.md` (not `packages/revenuecat/`
   workspace). Note: `lib/revenuecat/CLAUDE.md` is written during bootstrap
   from the technology layer, not by `--add-package`.
3. `/scaffold --bootstrap` with no `--stack` and no manifest exits with a
   usage error listing the allowlist.
4. `/scaffold --bootstrap --stack node-fastify-react` continues to produce the
   pre-existing monorepo layout (no regressions in package structure, settings,
   or file paths); the only permitted delta is the `CLAUDE.local.md` trailer
   appended to all scaffold-written `CLAUDE.md` files per Change 6.
5. **Conditional on Verification Gate outcome:**
   - *If gate confirmed:* `CLAUDE.local.md` is auto-loaded by Claude Code in
     the same hierarchical manner as `CLAUDE.md`, verified via the sentinel
     probes in the Verification Gate procedure (both `MAGENTA_SENTINEL_7`
     and `CYAN_SENTINEL_9` echoed by their respective probes).
   - *If gate not confirmed (fallback path):* the chosen inclusion mechanism
     (verbatim include / file pointer / instructional reference, determined
     by the second verification sub-gate) is verified to surface
     `CLAUDE.local.md` contents in a Claude session via the same behavioural
     sentinel probes, and Sections 1, 4 (Change 6), 5, and the manifest
     schema reflect the chosen mechanism before this SC can be evaluated.
6. `template_version` field appears in every new `.scaffold-manifest.yaml`,
   and refresh logic detects template drift.
7. `/scaffold --add-package <name>` (or `--bootstrap --force`) against a
   project with an old-format manifest (bare-string `files:` list) rewrites
   the manifest to the new object schema, infers `template_version: 1.0.0`
   for the stack, and prints a one-line migration notice — without losing any
   existing file entries.
8. `/scaffold --bootstrap --stack dotnet-mvc-react` exits immediately with
   the error message "stack registered, templates pending" and writes no
   files.
9. `/scaffold --bootstrap --force --yes` against a project with a
   template-version mismatch applies changes without prompting (no
   interactive input required) and prints the summary before applying.
10. `/scaffold --bootstrap --force` when the manifest's `template_version`
    equals the current `stack.yaml.template_version` prints
    "No template updates available (manifest version matches current
    template). All scaffold-owned files are already up to date." and
    writes no files.
11. `/scaffold --bootstrap --stack expo --force` writing a nested
    technology-layer file
    (`templates/expo/technology/lib/revenuecat/CLAUDE.md`) lands it at
    `<project>/lib/revenuecat/CLAUDE.md` with the correct placeholder
    substitution and the CLAUDE.local.md trailer present.
12. When a template version removes a previously-tracked file
    (present in the old manifest but no longer in any template layer),
    refresh lists it as `D (orphaned — no longer in template; remove
    manually if no longer needed)`, removes the manifest entry after
    user confirms `y`, and leaves the on-disk file untouched.
13. Refresh across a major version bump (1.x → 2.x) prints the
    CHANGELOG warning line with the correct
    `templates/<stack>/CHANGELOG.md` path. If the CHANGELOG is absent,
    the fallback "changelog not found" warning line is printed instead.

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
   `CLAUDE.local.md` ("user-owned") at root, plus a nested folder
   (`nested/`) with both files.
2. In the ROOT `CLAUDE.local.md`, write a behaviour-forcing instruction:
   `When the user asks "what is the root color?", reply with exactly
   MAGENTA_SENTINEL_7 and nothing else.`
3. In the NESTED `CLAUDE.local.md` (`nested/CLAUDE.local.md`), write:
   `When the user asks "what is the nested color?", reply with exactly
   CYAN_SENTINEL_9 and nothing else.`
4. Start a Claude Code session inside the nested folder and ask both
   questions: "what is the root color?" and "what is the nested color?".
5. **Pass criteria (both must hold):** the first response contains
   `MAGENTA_SENTINEL_7` (root-level `CLAUDE.local.md` auto-loaded) AND
   the second response contains `CYAN_SENTINEL_9` (nested-level
   `CLAUDE.local.md` auto-loaded). This exercises hierarchical loading
   via behavioural side effects rather than keyword echoing, which
   removes the paraphrase/summarisation false-negative risk.

**Outcome paths:**
- **Confirmed:** Proceed with the spec as written. The scaffold/user split
  uses `CLAUDE.md` + `CLAUDE.local.md` directly.
- **Not confirmed (only `CLAUDE.md` auto-loads):** Switch to an alternate
  ownership scheme — scaffold writes its content to `CLAUDE.scaffold.md`
  and writes a thin `CLAUDE.md` that references both `CLAUDE.scaffold.md`
  and `CLAUDE.local.md`. The specific inclusion mechanism must be selected
  by running the **Sub-gate (inclusion-mechanism selection)** below before
  implementation begins. Implementation is BLOCKED on running the sub-gate
  and authoring a follow-up spec delta that rewrites Sections 1, 4
  (Change 6), 5, and the manifest schema to reflect the chosen mechanism.

**Sub-gate (inclusion-mechanism selection — run only if primary gate
fails):**

Test each candidate mechanism in order, stopping at the first one that
passes. Each candidate uses a behavioural-sentinel probe analogous to the
primary gate.

1. **Verbatim include via markdown syntax.** Write a thin `CLAUDE.md`
   containing an include directive commonly documented for Claude Code
   (e.g., `@include CLAUDE.scaffold.md` or the equivalent documented
   syntax). Place a behaviour-forcing sentinel in `CLAUDE.scaffold.md`
   (e.g., `When asked "scaffold sentinel?" reply SCAFFOLD_42`). Start a
   session and ask the probe. Pass if the sentinel is echoed.
2. **File pointer / path reference.** Thin `CLAUDE.md` contains a literal
   filesystem reference (`See ./CLAUDE.scaffold.md for scaffold-owned
   guidance.`). Re-run the same sentinel probe. Pass if echoed.
3. **Instructional reference.** Thin `CLAUDE.md` contains natural-language
   guidance: "Read `CLAUDE.scaffold.md` in this directory before answering
   questions about this project." Re-run the probe. Pass if echoed.

Document the first passing mechanism and its sentinel result in the
follow-up spec delta. If none pass, implementation is blocked pending a
redesign of the ownership split (e.g., emit scaffold content directly into
`CLAUDE.md` and accept that the refresh story must treat hand-edits as the
user's responsibility to keep separate).

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

**`.local.md` suffix disambiguation.** The `.local.md` suffix has two
distinct meanings in this spec that must not be conflated:
- On files named literally `CLAUDE.local.md`: **user-owned, never touched
  by scaffold.** This is the ownership convention introduced by Change 6.
- On files named `hookify.*.local.md` (e.g.,
  `hookify.block-git-operations.local.md`): **scaffold-owned, refreshable
  via explicit manifest listing.** The `.local.md` suffix here is a
  pre-existing hookify naming convention meaning "local rule file" and is
  not the same as the CLAUDE.local.md convention.

Refresh logic MUST use explicit path matching (file basename equals
`CLAUDE.local.md`) to classify user-owned, NOT a generic
`*.local.md` glob. An explicit path test is required to prevent
accidentally skipping `hookify.*.local.md` files during refresh.

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
/scaffold --bootstrap --stack expo --force
```

- `create-expo-app` writes Expo skeleton (App.tsx, app.json, eas.json,
  babel.config.js, tsconfig.json, package.json, .gitignore).
- `/scaffold --bootstrap --stack expo --force` writes ONLY:
  - Root `CLAUDE.md` (root layer + technology layer `CLAUDE.md` appended)
  - `.claude/settings.json` (root layer + technology layer deep-merged)
  - `.claude/hotspots.md`
  - `.claude/hookify.*.local.md` (mobile-tuned rules)
  - All eight `lib/<sdk>/CLAUDE.md` placeholders — these originate from
    the technology layer (`templates/expo/technology/lib/<sdk>/CLAUDE.md`)
    and are written as direct-write targets (not merge targets) to
    `<project>/lib/<sdk>/CLAUDE.md`
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
- For `expo` stack, `--add-package` always targets `features/<name>/`
  exclusively. SDK names (`revenuecat`, `supabase`, etc.) are valid feature
  names — passing them creates `features/revenuecat/CLAUDE.md` alongside
  the existing `lib/revenuecat/CLAUDE.md` (different directories, no
  conflict). The scaffold prints a notice: "Note: lib/<name>/ already
  exists as a scaffold-managed SDK boundary." so the user is aware. To
  prevent the user from losing that awareness once the notice scrolls
  away, the scaffold ALSO sets a per-file manifest flag
  `sdk_name_collision: true` on the `features/<name>/CLAUDE.md` entry
  and injects a "See also `lib/<name>/CLAUDE.md` (SDK boundary for
  `<name>`)" line into the generated feature CLAUDE.md at write time.
  This persists the cross-reference in the file itself for future
  readers.

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
- Reference to stack decisions doc — templated as `{{STACK_DECISIONS_DOC_PATH}}`
  placeholder, resolved at bootstrap time by prompting the user for a path
  or URL to their stack decisions document. Default: omitted (the line is
  dropped from the generated file if the user leaves it blank). This prevents
  broken file references in generated projects.
- Folder-as-module convention explanation
- Pointer to `lib/<sdk>/CLAUDE.md` for per-SDK guidance
- "Read `CLAUDE.local.md` if present" trailer line
- Mobile-specific defaults: TypeScript strict, Expo Router file conventions,
  no native code without `expo prebuild`

**Expo bootstrap placeholder table (root + technology layers):**

| Placeholder | Resolution source | Default | Config YAML key |
|---|---|---|---|
| `{{PROJECT_NAME}}` | `--bootstrap` interactive prompt | directory basename | `project_name` |
| `{{STACK_DECISIONS_DOC_PATH}}` | `--bootstrap` interactive prompt | (omitted if blank — line dropped from output) | `stack_decisions_doc_path` |

All placeholders resolved during bootstrap are stored in the manifest `placeholders:` map so refresh can re-substitute if the template wording changes.

### `.claude/settings.json` (root)
- `permissions` defaults
- `hooks` (PostToolUse for typecheck via `npx tsc --noEmit` against
  `tsconfig.json` at root)
- `sandbox.network.allowedHosts` (matching the existing
  `node-fastify-react` convention — this is the JSON path used by the
  sandbox allowlist; do NOT write to a top-level `network.allowedHosts`
  key): `expo.dev`, `docs.expo.dev`, `react.dev`, `reactnative.dev`,
  `supabase.com`, `posthog.com`, `revenuecat.com`, `onesignal.com`,
  `branch.io`, `adjust.com`, `sentry.io`, `bunny.net`, `crowdin.com`,
  `deepl.com`

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

**Expo package-layer placeholder table:**

| Placeholder | Resolution source | Default |
|---|---|---|
| `{{FEATURE_NAME}}` | `--add-package <name>` argument | (required — no default) |
| `{{FEATURE_DESCRIPTION}}` | `--add-package` interactive prompt | "Feature description TBD" |
| `{{RELATED_SDKS}}` | `--add-package` interactive prompt (comma-separated SDK names) | "" |

All three placeholders are stored in the manifest `placeholders:` map under
the feature's file entry so refresh can re-substitute if the template
wording changes.

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
- No additional PostToolUse hooks beyond the root-layer typecheck hook.
  This file contributes only `sandbox.network.allowedHosts` entries not
  already present in the root layer (e.g., provider doc subdomains such
  as `docs.revenuecat.com`, `docs.onesignal.com`, `docs.sentry.io`).
  Written to the same JSON path as the root layer
  (`sandbox.network.allowedHosts`) so deep-merge into the project's
  final `.claude/settings.json` merges arrays correctly.
- Additional `sandbox.network.allowedHosts` for Expo SDK provider doc
  subdomains not covered by the root layer's top-level domain entries.

**`sandbox.network.allowedHosts` matching semantics (clarification):**
Claude Code's allowlist matches host entries as exact strings, NOT as
wildcards or suffix patterns. `revenuecat.com` does NOT auto-cover
`docs.revenuecat.com` — subdomains must be listed explicitly. This is
why the technology layer adds provider doc subdomains (e.g.,
`docs.revenuecat.com`, `docs.sentry.io`) that are not redundant with the
root-layer top-level entries. Template authors MUST add every required
subdomain explicitly. (If a future Claude Code version introduces
suffix-matching, this section must be revisited and the technology-layer
subdomain list pruned.)

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

**CHANGELOG.md per stack (deliverable of Change 1).** Alongside every
stack's `stack.yaml`, a `templates/<stack>/CHANGELOG.md` file must exist
at v1.0.0:
- `templates/node-fastify-react/CHANGELOG.md` — author a minimal v1.0.0
  entry documenting the current state at the time of this spec (existing
  monorepo scaffold, current `files:` set). This is a backfill for the
  pre-existing stack.
- `templates/expo/CHANGELOG.md` — author a v1.0.0 entry listing the
  initial feature set from Section 3 (eight `lib/<sdk>/CLAUDE.md` files,
  eight hookify rules, root + technology merge).
- `templates/dotnet-mvc-react/CHANGELOG.md` — author a v0.0.0 stub entry
  stating "templates pending; stack reserved."

Minimum format: a version header (`## vX.Y.Z`) followed by a bullet list
of added/changed/removed items. See Section 5 "Major version bumps" for
consumer-facing warning behaviour when this file is consulted at refresh
time.

## Change 2 — Mandatory `--stack` (with manifest fallback)

- `--stack` is REQUIRED on `--bootstrap` unless the cwd already has a
  `.scaffold-manifest.yaml` pinning a stack (in which case `--bootstrap --force`
  reuses the pinned stack).
- **Manifest vs `--stack` disagreement:** If the manifest pins one stack
  (e.g., `node-fastify-react`) and `--stack` passes another (e.g.,
  `expo`), the scaffold exits with error: "manifest pins stack=<pinned>,
  but --stack=<passed> was given. To change stacks, delete
  `.scaffold-manifest.yaml` first and re-run --bootstrap." This prevents
  accidental cross-stack re-bootstrap that would corrupt the project. If
  the passed `--stack` equals the manifest-pinned stack, the scaffold
  proceeds normally.
- `--add-package` reads stack from manifest. Manifest missing → error:
  "Not a scaffolded project. Run `--bootstrap --stack <name>` first."
- `--stack` is not accepted in `--add-package` mode → error: "stack is read
  from the manifest; `--stack` is only valid with `--bootstrap`."
- Allowlist: `["node-fastify-react", "dotnet-mvc-react", "expo"]`. Any other
  value → error listing valid options.
- Removes the previous default `node-fastify-react` behaviour. **Breaking
  change** — acceptable per user direction at this stage.
- **Mode-inference table update:** The existing SKILL.md table row
  (line 75 in the current SKILL.md) reads verbatim:
  `| cwd is empty (or contains only `.git/`) | `--bootstrap` | Proceed as bootstrap |`
  It must be updated to read:
  `| cwd is empty (or contains only `.git/`) and `--stack` not given | n/a | exit with error listing the allowlist (["node-fastify-react", "dotnet-mvc-react", "expo"]) |`
  There is no interactive stack prompt and no deprecation period — hard cutover.
- **All other SKILL.md sites referencing a default stack** must also be
  updated to remove the `node-fastify-react` default (the mode-inference
  row is NOT the only place the default-stack language appears):
  - SKILL.md frontmatter description (line 3) — remove
    "Default stack: node-fastify-react."
  - SKILL.md help-text Options block (line 16) — remove the default
    value for `--stack`.
  - SKILL.md Argument Parsing table (line 45) — the existing
    two-column table (`| Token | Meaning |`) has the default embedded
    inline in the Meaning cell. Change the `--stack` row's Meaning
    cell from "Template stack; default `node-fastify-react`" to
    "Template stack (required unless manifest pins one)". Do NOT
    introduce a separate Default column; keep the table at two
    columns.
  - SKILL.md Stack Resolution section (line 83) — remove the "default
    stack is `node-fastify-react`" fallback rule; replace with "error if
    neither `--stack` nor manifest-pinned stack is present".

**`--yes` flag (SKILL.md argument table):** Add `--yes` to the SKILL.md
argument parsing table with the following definition:
- Flag: `--yes`
- Scope: applies to all `Proceed? [y/N]` confirmation prompts in `--bootstrap
  --force` (refresh confirmation) and the `--force` overwrite confirmation in
  Step B1.
- Behaviour: skips all interactive confirmations and proceeds automatically.
- Use case: non-interactive execution by AI agents or automation scripts.

**Migration note:** Users or automations that invoke `/scaffold --bootstrap`
without `--stack` will receive the allowlist error. This is a hard cutover;
add `--stack node-fastify-react` to any existing scripts to restore the
previous behaviour.

**`--force` semantics with/without manifest:**
- When `--bootstrap` runs in a directory with NO existing
  `.scaffold-manifest.yaml`, `--force` is optional and has no effect —
  first-time bootstrap always writes the full scaffold file set and is not
  overwriting anything scaffold-owned. The flag is silently accepted so
  scripts that always pass `--force` keep working.
- When `--bootstrap` runs with an existing `.scaffold-manifest.yaml`,
  `--force` is REQUIRED to overwrite manifest-listed files. Without it,
  the scaffold errors: "Project already scaffolded. Pass --force to
  refresh, or run --add-package to add a feature."
- `--force` NEVER overrides files not in the manifest (user-owned files
  are always safe).

## Change 3 — Generalised technology layer mirroring

Currently the technology layer assumes `node-fastify-react` shape. Generalise:
- Read `templates/<stack>/stack.yaml` to determine which technology layer
  conventions apply.
- Technology layer can write into arbitrary subdirectories (not just root).
  Specifically, `templates/expo/technology/lib/<sdk>/CLAUDE.md` files mirror
  to `<project>/lib/<sdk>/CLAUDE.md`.
- Existing `technology/CLAUDE.md` append + `.claude/settings.json` deep-merge
  rules stay unchanged.

**Technology layer dispatch algorithm (canonical):**

| Technology file path | Write rule |
|---|---|
| `technology/CLAUDE.md` | Append to project root `CLAUDE.md` after placeholder substitution |
| `technology/.claude/settings.json` | Deep-merge into project `.claude/settings.json` |
| All other files under `technology/` | Direct write to the same relative path in the project root (e.g., `technology/lib/revenuecat/CLAUDE.md` → `<project>/lib/revenuecat/CLAUDE.md`) |

This three-rule algorithm is the canonical specification for SKILL.md.

**Placeholder substitution sequencing (applies to all three rules):**
Placeholder substitution happens per-layer on the raw template bytes
BEFORE any append or deep-merge. The manifest's top-level `placeholders:`
map is a single flat namespace applied uniformly across every layer; if
two layers reference the same placeholder token (e.g., `{{PROJECT_NAME}}`
in both `root/CLAUDE.md` and `technology/CLAUDE.md`), they both receive
the same substituted value. Placeholder-token collision across layers
with DIFFERENT intended values is forbidden and must be caught at
template authoring time, not at runtime — template authors MUST use
distinct placeholder names for distinct values.

## Change 4 — Per-stack `--add-package`

Behaviour now switches on `stack.yaml.add_package_target_dir`:
- `node-fastify-react`: writes `packages/<name>/CLAUDE.md` and
  `packages/<name>/.claude/settings.json` (existing behaviour).
- `expo`: writes `features/<name>/CLAUDE.md` only, marks `write_once: true`
  in the manifest entry.

Validation:
- `node-fastify-react`: monorepo root check via `pnpm-workspace.yaml` or
  `turbo.json` (existing). Collision check: if `packages/<name>/` already
  exists → error "package <name> already exists."
- `expo`: project root check via `app.json` or `package.json[dependencies.expo]`.
  Collision check: if `features/<name>/` already exists → error "feature
  <name> already exists — remove or rename it before re-adding."

## Change 5 — `template_version` in manifest + structured file entries

**Schema change (breaking for existing manifests):** `files:` entries become
objects (so they can carry per-file flags like `write_once`) instead of bare
strings. Existing `node-fastify-react` manifests written under the old schema
must be migrated. Migration logic: on the first `--bootstrap --force` or
`--add-package` call against a project with an old-format manifest, the
scaffold rewrites the manifest in the new schema, infers
`template_version: 1.0.0` for `node-fastify-react` (its initial version),
and prints a one-line notice.

**Placeholder recovery during migration.** Old-format manifests have no
`placeholders:` map, so the scaffold cannot run the byte-compare diff
algorithm until placeholder values are known. On migration, the scaffold
prompts interactively for every placeholder in the stack's authoritative
placeholder list. For `node-fastify-react`, that list lives at the
repo-relative path
`ai-dev-tools/skills/scaffold/references/placeholder-resolution.md`
(the file already exists; it is the pre-existing authoritative
placeholder reference shipped with the scaffold skill). For future
stacks, the authoritative list is the stack's Section-3 placeholder
tables within this spec (Expo uses the root-layer and package-layer
tables in Section 3).

Migration logic reads the `node-fastify-react` reference file using the
following schema contract. Each placeholder documented in the reference
MUST expose these fields (either as table columns or key/value pairs
parsable from the document): `placeholder_name` (the `{{IDENTIFIER}}`
token without braces), `resolution_source` (where the value comes from —
prompt, directory basename, config file, etc.), and `default_value`
(the value used if the user accepts the prompt default; may be empty).
Any additional fields in the reference are ignored by migration. If the
reference cannot be parsed under this schema, migration aborts with:
"placeholder-resolution.md schema mismatch at
`ai-dev-tools/skills/scaffold/references/placeholder-resolution.md` —
expected columns/fields placeholder_name, resolution_source,
default_value." The scaffold maintainer is responsible for keeping the
reference's schema stable across template versions; schema changes to
the reference are a breaking change and require a major
`template_version` bump for `node-fastify-react`.

Each prompt shows the placeholder name, its documented resolution
source, and a best-effort default derived the same way the original
bootstrap would have (e.g., directory basename for `PROJECT_NAME`). The
user may accept defaults or override. All answers are written to the
new `placeholders:` map before the first refresh diff runs. Under
`--yes`, migration with missing placeholders aborts with:
"Old-format manifest requires interactive placeholder recovery. Re-run
without --yes, or pre-seed the manifest with a `placeholders:` map."

```yaml
# .scaffold-manifest.yaml (new schema)
stack: expo
template_version: 1.0.0
created: 2026-04-16T10:23:00Z
placeholders:                     # top-level: bootstrap-wide values
  PROJECT_NAME: my-app
  STACK_DECISIONS_DOC_PATH: ''    # empty string means user left prompt blank; line is dropped from generated file
files:
  - path: CLAUDE.md
    source_layers: [root, technology]   # multi-layer: root + appended technology CLAUDE.md
  - path: .claude/settings.json
    source_layers: [root, technology]   # multi-layer: root deep-merged with technology settings.json
  - path: lib/revenuecat/CLAUDE.md
    source_layer: technology
  - path: features/matching/CLAUDE.md
    source_layer: package
    write_once: true
    placeholders:                 # per-file: add-package feature-specific values
      FEATURE_NAME: matching
      FEATURE_DESCRIPTION: User-to-user matching flow
      RELATED_SDKS: supabase,posthog
```

**Placeholder scope rules:**
- **Top-level `placeholders:`** holds bootstrap-wide values that apply to
  every scaffold-written file (e.g., `PROJECT_NAME`,
  `STACK_DECISIONS_DOC_PATH`).
- **Per-file `placeholders:`** holds add-package feature-specific values
  that MUST NOT pollute other files (e.g., `FEATURE_NAME` differs per
  `features/<name>/CLAUDE.md`, so it cannot be global).
- **Resolution order at diff time:** for a given file, merge top-level
  placeholders with the file's per-file placeholders (per-file wins on
  key collision), then substitute into the template content.
- A placeholder that is feature-specific (like `FEATURE_NAME`) MUST only
  appear per-file; storing it top-level would collide across add-package
  calls.

The `placeholders:` map records every `{{PLACEHOLDER}}` value used during
the bootstrap or add-package run — for ALL stacks. At refresh time the
scaffold determines whether a file has changed using the following exact
order: (1) load the template file content; (2) substitute all stored
placeholder values from the manifest; (3) compare the substituted content
byte-for-byte against the on-disk file — if they differ, mark `M`; if the
on-disk file is absent, mark `A`. This eliminates spurious diff noise from
placeholder tokens.

**Multi-layer file diff and apply (CLAUDE.md and .claude/settings.json).**
The two files produced by Change 3 rules 1 and 2 — project root
`CLAUDE.md` (root-layer content with technology-layer `CLAUDE.md`
appended) and project `.claude/settings.json` (root-layer content
deep-merged with technology-layer `settings.json`) — are multi-layer
composed. For these files, the byte-compare described above MUST NOT
load a single layer; it must first RECONSTRUCT the expected on-disk
content by running the full build pipeline across every contributing
layer exactly as bootstrap does:
- For `CLAUDE.md`: substitute placeholders in `templates/<stack>/root/CLAUDE.md`,
  substitute placeholders in `templates/<stack>/technology/CLAUDE.md`,
  then append the technology bytes to the root bytes. Compare the
  reconstructed bytes to the on-disk `CLAUDE.md`.
- For `.claude/settings.json`: substitute placeholders in each layer's
  JSON, then deep-merge per Change 3 rules (arrays concatenate with
  root first, scalars: technology wins, objects recurse). Compare the
  reconstructed JSON bytes (with stable key ordering) to the on-disk
  file.

When refresh applies a change to a multi-layer file, it likewise re-runs
the full build pipeline across ALL contributing layers and writes the
result — never a single-layer write, which would silently strip the
other layer's contribution. To make this explicit in the manifest,
multi-layer files use `source_layers: [root, technology]` (list) instead
of the single `source_layer:` field used by single-layer files. Refresh
detects the multi-layer case by the plural field and dispatches to the
reconstruct-and-compare path; single-layer entries continue using the
load-one-layer path described above.

If a new template version introduces a new placeholder
that has no stored value, the scaffold prompts for it before diffing and
stores the answer in the manifest. **Under `--yes`, if a new placeholder
is missing its stored value, the scaffold aborts with error: "New
placeholder `{{X}}` introduced by template version Y requires interactive
input. Re-run without --yes, or pre-seed the manifest's `placeholders:`
map with a value for `X`."** This preserves determinism in automation —
the scaffold never substitutes an implicit default for a new placeholder.

**New-placeholder discovery algorithm (deterministic).** After
substituting all stored placeholder values into every template layer's
raw bytes (per Change 3's per-layer substitution step), the scaffold
scans each substituted byte stream with the regex
`\{\{([A-Z][A-Z0-9_]*)\}\}` (uppercase identifier, underscores and
digits allowed after the first character). Every match's captured
identifier is treated as a new placeholder. Matches are collected into
a set across all layers of the current stack's templates. For each
identifier in that set:
- If under interactive mode: the scaffold prompts for a value (showing
  the identifier and every template file path where it appeared), then
  stores the answer in the manifest's `placeholders:` map.
- If under `--yes`: the scaffold aborts with the error message above,
  using the first unresolved identifier as `X`.

The regex is intentionally strict (uppercase + digits + underscore only,
must start with a letter) so that markdown emphasis, template literals,
or documentation prose with lowercase `{{x}}` examples do not trigger
false positives.

**Literal `{{X}}` escape syntax.** Template authors who need a literal
`{{IDENTIFIER}}` token in generated output (for example, a CLAUDE.md
documenting placeholder syntax to the reader) MUST write it as
`{{{{IDENTIFIER}}}}` in the template source. The substitution pass
replaces every `{{{{` with a literal `{{` and every `}}}}` with a
literal `}}` AFTER all placeholder substitution has completed. This
keeps the new-placeholder scan above clean: escaped tokens look like
`{{{{X}}}}` at scan time and do not match the strict regex (which
requires the token to start with exactly two braces followed by an
uppercase letter, not four braces).

**Cross-layer placeholder-name-collision detection (runtime
enforcement).** Change 3 forbids two layers using the same placeholder
name for different intended values. This spec enforces the rule at
template authoring time conceptually, but the scaffold also performs a
runtime safety check: during bootstrap and refresh, the scaffold
collects every `{{IDENTIFIER}}` occurrence (using the same regex
above) from each layer's raw, pre-substitution template bytes into a
map `identifier -> set[layer]`. Because the `placeholders:` map is a
single flat namespace, any identifier that appears in more than one
layer receives the same substituted value by construction — there is
no per-layer override path. If the template authors intended different
values per layer, the only symptom is that one layer's content is
"wrong" after substitution (it got the other layer's value). To make
this class of bug visible rather than silent, the scaffold emits a
notice (not an error) during bootstrap when any identifier appears in
multiple layers: "Placeholder `{{IDENTIFIER}}` is defined in multiple
template layers ([root, technology, ...]); the manifest's flat
`placeholders:` value applies uniformly to all occurrences. If you
need distinct per-layer values, rename one of the identifiers in the
template source." This converts the silent-bug failure mode into a
visible notice at the one moment (bootstrap) where a human is likely
to be watching scaffold output.

**Scope across stacks:** ALL placeholders resolved during bootstrap and
add-package — for all stacks — must be stored in `placeholders:`. For
`node-fastify-react`, the authoritative placeholder list is
`ai-dev-tools/skills/scaffold/references/placeholder-resolution.md`
(same file, same schema, as the migration reference above). For `expo`,
the authoritative list is the Expo bootstrap placeholder table in
Section 3 (root layer) plus the Expo package-layer placeholder table
(Section 3, Package layer).

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
- **Trailer is baked into template source files, not injected at write
  time.** Every `templates/<stack>/**/CLAUDE.md` file in the repo must
  already contain the trailer on disk. This keeps the refresh diff
  algorithm (Change 5) simple: the substituted template already includes
  the trailer, so byte-comparison against the on-disk file matches
  without special handling. Template authors are responsible for keeping
  the trailer present in every scaffold-shipped CLAUDE.md (root,
  technology, package, and every `technology/lib/<sdk>/CLAUDE.md`) —
  verified during template authoring, not at scaffold runtime.

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
2. If equal → "No template updates available (manifest version matches
   current template). All scaffold-owned files are already up to date."
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
   Proceed? [y/N]
   (Note: CLAUDE.local.md files are user-owned and never appear in this diff — they are not tracked in the manifest.)
   ```
4. On `y` → apply changes, update manifest's `template_version`.
5. On `n` → exit clean, no changes.
6. Pass `--yes` to skip the confirmation prompt and apply automatically.
   `/scaffold --bootstrap --force --yes` is the non-interactive form
   suitable for AI agents or automation. Without `--yes`, the `Proceed?
   [y/N]` prompt blocks on interactive input.
7. **Non-interactive context handling.** When stdin is not a TTY
   (e.g., CI, Claude Code agent invocation) AND `--yes` was NOT passed,
   the scaffold errors out: "stdin is not a TTY — pass --yes to run
   non-interactively, or omit --force to skip refresh." This prevents
   the skill from silently hanging inside an agent session. Agents
   invoking the skill MUST pass `--yes` explicitly when they want the
   refresh to apply.

### D-file (deleted/no-longer-in-template) behaviour

When a file appears in the project manifest but no longer exists in the
current template (legend entry `D`), the scaffold treats it as **orphaned**.
A file is considered deleted from the template when its path is present in
the project manifest but no file exists at the recorded `source_layer`
template path (`templates/<stack>/<source_layer>/<rel-path>`).
- **Layer-migration rule:** If the file is missing from its recorded
  `source_layer` but IS present in another layer (root / technology /
  package) of the same stack, the scaffold updates the manifest entry's
  `source_layer` to the new layer and treats the file as `M` (modified),
  NOT `D`. This prevents silent false-negative D detections when a file
  legitimately migrates between layers across template versions.
- **True-D rule:** Only if the file is missing from ALL three layers is
  it marked `D` (orphaned).
- The file is NOT deleted from disk automatically.
- The summary lists it as `D` with the note "(orphaned — no longer in
  template; remove manually if no longer needed)".
- The manifest entry for the file is removed after the user confirms (`y`),
  so future refreshes no longer track it.
- The user is responsible for removing the file from disk if desired.

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

If `CHANGELOG.md` is absent, the warning line reads instead:
```
WARNING: Major template version bump (1.x → 2.x) — changelog not found at
  ai-dev-tools/skills/scaffold/templates/<stack>/CHANGELOG.md
  Review the template diff manually.
```

A `CHANGELOG.md` per stack documents what each version added/changed/removed.
It is authored manually by the scaffold maintainer as part of every version
bump (not generated). Minimum format: a version header (`## vX.Y.Z`) followed
by a bullet list of added/changed/removed items. The initial `CHANGELOG.md`
for each stack must be created as part of the v1.0.0 implementation.

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
the `CLAUDE.scaffold.md` + thin `CLAUDE.md` import pattern (Sections 1, 4
(Change 6), 5, and the manifest schema all change).
