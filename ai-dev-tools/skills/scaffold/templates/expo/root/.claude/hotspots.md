# Hotspots — {{PROJECT_NAME}} (Expo)

## 1) Repo overview
- Single-package **Expo (React Native)** app (no monorepo).
- Primary runtime entrypoint: `app/_layout.tsx` (Expo Router root layout).
- UI routes: `app/**` (file-based routing; deepest `_layout.tsx` applies).
- SDK boundaries: `lib/<sdk>/` — each has its own scaffold-owned `CLAUDE.md`.
- Feature boundaries: `features/<name>/` — each carved via
  `/scaffold --add-package <name>`.

## 2) Hotspot map

| Area | Start here | High-change files/dirs | Config / secrets | Notes |
|---|---|---|---|---|
| Routing + layouts | `app/_layout.tsx` | `app/**/*.tsx` | `app.json` | File names map to URL segments; `_layout.tsx` nests layouts |
| SDK clients | `lib/<sdk>/` | `lib/<sdk>/index.ts` | EAS Secrets, Supabase env | Always route SDK calls through `lib/<sdk>/` — never call the SDK directly from a screen |
| Domain features | `features/<name>/` | `features/<name>/*.screen.tsx`, `*.store.ts` | — | Seeded once by add-package; refresh skips these |
| Supabase data | `lib/supabase/` | Edge Functions in Supabase dashboard / `supabase/` dir if used | Supabase URL + anon key | RLS policies enforce tenant isolation — do not bypass them client-side |
| Push notifications | `lib/onesignal/` | `app.json` plugins | OneSignal app ID | RevenueCat webhooks → OneSignal for entitlement-gated campaigns |
| Crash / error | `lib/sentry/` | `app.json` (Sentry config plugin) | Sentry DSN | Wrap root layout in Sentry ErrorBoundary |
| Build + release | `eas.json` | `app.json` | EAS Secrets | EAS Build for native; `eas update` for JS-only OTA |

## 3) Commands (copy/paste)

### Start / typecheck
```bash
npx expo start
npx tsc --noEmit
```

### Install (wrap npm with SDK compat)
```bash
npx expo install <package>
```

### Find entrypoints + route files
```bash
rg --files app lib features | rg "\\.(tsx|ts)$"
```

### Find SDK call sites (example: RevenueCat)
```bash
rg -n "from ['\"]react-native-purchases['\"]" .
```

### Build + OTA
```bash
eas build --platform all       # full native build
eas update --branch production # JS-only OTA update
```

## 4) SDK boundaries (see `lib/<sdk>/CLAUDE.md` for each)
- `revenuecat`, `posthog`, `onesignal`, `branch`, `adjust`,
  `sentry`, `i18n`, `supabase`.

## 5) Integration touchpoints
- Screen → feature store: features export a Zustand store + screen components.
- Feature → SDK: features call `lib/<sdk>/` helpers, never the SDK directly.
- Supabase auth → app: Supabase session state lives in `lib/supabase/`;
  UI reads it via a React Query hook or a Zustand mirror.
- RevenueCat → OneSignal: entitlement changes update OneSignal tags via
  a Supabase Edge Function or a webhook handler.
