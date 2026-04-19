# Claude Project Instructions — {{PROJECT_NAME}}

## Stack Summary

This is a single-package **Expo (React Native)** app. Core pieces:

- **Runtime / routing:** Expo SDK + Expo Router (file-based routing in `app/`)
- **Backend-as-a-service:** Supabase (managed Postgres + Auth + Storage +
  Realtime + Edge Functions)
- **Standardised SDKs** (see `lib/<sdk>/CLAUDE.md` for each):
  `revenuecat` (subscriptions), `posthog` (product analytics),
  `onesignal` (push), `branch` (deferred deep links),
  `adjust` (attribution), `sentry` (crash + error),
  `i18n` (expo-localization + i18next), `supabase` (BaaS client).

Stack decisions reference:

{{STACK_DECISIONS_DOC_PATH}}

## Folder-as-module convention

This project has **no monorepo / no workspaces**. Governance for an area
lives in the nearest `CLAUDE.md` above the code:

- `lib/<sdk>/CLAUDE.md` — scaffold-owned; documents each SDK boundary.
  All calls into that SDK route through `lib/<sdk>/`.
- `features/<name>/CLAUDE.md` — scaffold-seeded on
  `/scaffold --add-package <name>` (write-once). Documents a domain
  feature (a screen, its store, its types, its related SDKs).
- Root `CLAUDE.md` (this file) covers cross-cutting conventions.

Claude Code loads CLAUDE.md files hierarchically — the deepest match
applies, so a file edited under `lib/revenuecat/` inherits guidance from
this file AND `lib/revenuecat/CLAUDE.md`.

## Mobile defaults

- **TypeScript strict.** `tsconfig.json` must keep `"strict": true`.
  Never silence strict-mode errors — fix them.
- **Expo Router file conventions.** Route files live in `app/`. File
  names map to URL segments (`app/(tabs)/home.tsx` → `/home`). Nested
  layouts via `_layout.tsx`. Dynamic segments via `[param].tsx`.
- **No native code edits without prebuild.** Do not edit `ios/` or
  `android/` directly unless you have run `npx expo prebuild` and
  understand you have just left the managed workflow.
- **`app.json` changes need EAS rebuild.** Adding a plugin, permission,
  or updating any native-affecting field means the next build is a full
  EAS build, not an OTA update.
- **Secrets policy.** No API keys in `app.json` or committed `.env`
  files. Use EAS Secrets (`eas secret:create`) for build-time secrets
  and Supabase env vars for runtime secrets.
- **State management baseline.** React Query for server state, Zustand
  for client state. Do not introduce Redux or MobX without explicit
  discussion.

## Commands

```bash
npx expo start              # dev server
npx expo install <pkg>      # install a package (wraps npm install with SDK compat)
npx tsc --noEmit            # typecheck
npx expo prebuild           # generate native ios/android dirs (one-way)
eas build --platform all    # full native build via EAS
eas update                  # ship a JS-only OTA update
```

## Per-SDK guidance

Before touching code that calls an SDK, read the relevant
`lib/<sdk>/CLAUDE.md` for that SDK's usage contract and what NOT to do.

## Coding guidelines

1. Follow the existing architecture and folder structure. If a change
   requires restructuring, ask first.
2. Keep diffs small and high-signal.
3. Prefer explicit TypeScript types; avoid `any`.
4. Cross-folder imports use relative paths. If imports become unwieldy
   (past ~50 modules), revisit whether to add path aliases in
   `tsconfig.json`.
5. After multi-file changes, run `npx tsc --noEmit` and fix errors
   before considering the task complete.

## Backwards Compatibility

Default policy: clean break. New code replaces old code. Do not add
dual-path shims, `if old_format` branches, or deprecation pathways
unless a spec explicitly requires legacy support (e.g., "must keep v1
endpoint while adding v2"). When in doubt, delete the old path.

To flip project-wide policy: edit this section in the root CLAUDE.md.
For one-off feature exceptions: state the requirement in the feature spec.

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
