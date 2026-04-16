# `features/{{FEATURE_NAME}}/` — Feature Instructions

## Feature overview

{{FEATURE_DESCRIPTION}}

## Expected file structure

```
features/{{FEATURE_NAME}}/
├── {{FEATURE_NAME}}.screen.tsx    # Primary screen component
├── {{FEATURE_NAME}}.store.ts      # Zustand store for ephemeral client state
├── {{FEATURE_NAME}}.types.ts      # TypeScript types scoped to this feature
├── {{FEATURE_NAME}}.queries.ts    # React Query hooks (optional; for server state)
└── CLAUDE.md                      # This file — scaffold-owned, write-once
```

Add files as the feature grows (sub-components, custom hooks). Keep the
folder flat until complexity actually demands nesting — avoid
premature `components/` / `hooks/` subfolders.

## Related SDKs

This feature interacts with: {{RELATED_SDKS}}

For each listed SDK, read `lib/<sdk>/CLAUDE.md` before writing code that
calls it. All SDK calls route through `lib/<sdk>/` helpers — never
import the SDK package directly from this feature.

## Conventions

- **Screen component** exports a default React component rendered by
  Expo Router (the route file under `app/` imports and renders this).
- **Store** uses Zustand; persist with `AsyncStorage` via
  `zustand/middleware` only when the state must survive app restart.
- **Types** are local unless they are shared across features — shared
  types live in a top-level `types/` or in the relevant `lib/<sdk>/`.
- **Queries** use React Query. Keys follow `[feature, resource, ...args]`
  pattern, e.g., `['{{FEATURE_NAME}}', 'detail', id]`.
- **User-facing strings** go through `t()` from `react-i18next` — never
  inline.

## Testing

This project has no top-level test suite. If you add tests for this
feature, note the command in `CLAUDE.local.md` so teammates can run
them.

## What NOT to do

- **Do not import from another feature directly.** If two features need
  the same logic, promote it to `lib/` (if SDK-adjacent) or a shared
  module.
- **Do not call SDK packages directly.** Route through
  `lib/<sdk>/` helpers.
- **Do not put business logic in the screen component.** Screens
  orchestrate — stores and query hooks own behaviour.

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
