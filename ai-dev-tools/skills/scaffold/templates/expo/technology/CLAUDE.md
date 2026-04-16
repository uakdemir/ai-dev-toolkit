## Technology Layer — Expo + Supabase + Mobile SDK Stack

These instructions supplement the root `CLAUDE.md` with Expo- and
mobile-specific conventions.

## Expo Router patterns

- **File-based routing.** Files under `app/` map to URL segments. Group
  folders with parentheses do not affect the URL (`app/(tabs)/home.tsx`
  → `/home`).
- **Layouts.** `_layout.tsx` wraps every child route. Nest layouts for
  tabs, modals, and auth gating. The root `app/_layout.tsx` is where
  global providers (Query client, Sentry boundary, i18n provider, theme)
  live.
- **Dynamic routes.** `[param].tsx` receives `useLocalSearchParams()`.
- **Deep linking.** Expo Router handles URL → route mapping automatically.
  Use `Linking.openURL()` for outbound links and `useLocalSearchParams()`
  to read inbound link params.

## Supabase usage patterns

- **Single client instance.** `lib/supabase/client.ts` instantiates the
  client once (URL + anon key from env). Every call goes through this
  instance — no ad-hoc clients elsewhere.
- **RLS by default.** All tables must have Row-Level Security enabled.
  Client code assumes RLS is on; never disable it for convenience.
- **Edge Functions.** Server logic that needs a service-role key
  (webhooks, admin ops) lives in Supabase Edge Functions, invoked from
  the client via `supabase.functions.invoke(<name>)`.
- **Realtime.** Subscribe in a React Query `useEffect` with proper
  cleanup; unsubscribe on unmount to avoid memory leaks.

## State management

- **Server state → React Query.** Every Supabase/API call is wrapped in
  a `useQuery` or `useMutation` hook in `lib/supabase/hooks/` or
  `features/<name>/*.queries.ts`.
- **Client state → Zustand.** Ephemeral UI state (modals, drafts) lives
  in Zustand stores, one per feature (`features/<name>/*.store.ts`).
- **Persisted client state.** Use `zustand/middleware` `persist` with
  `AsyncStorage` for state that should survive app restart.

## i18n (expo-localization + i18next)

- `lib/i18n/` owns i18n init and language detection.
- Translation JSON lives under `lib/i18n/locales/<lang>.json`.
- Use the `t()` function from `react-i18next`. Do not inline user-facing
  strings in components.

## Push notifications (OneSignal + RevenueCat integration)

- `lib/onesignal/` owns OneSignal init and tag management.
- Entitlement-gated campaigns flow:
  `RevenueCat webhook → Supabase Edge Function → OneSignal tag update`.
- Do NOT write user PII to OneSignal tags — only IDs and non-PII labels.

## Deep links

- **In-app links:** Expo Linking (already wired by Expo Router).
- **Deferred deep links (install attribution):** Branch.io, owned by
  `lib/branch/`. Branch resolves the first-open target after install.
- Use Branch for "install this app from a link" flows, not for
  in-session navigation.

## Crash and error monitoring

- `lib/sentry/` owns Sentry init via the Expo config plugin in `app.json`.
- Wrap the root layout in `Sentry.ErrorBoundary`.
- Capture non-fatal errors with `Sentry.captureException(e)` at catch
  sites. Add user context after auth.

## Build and release flow

- **Dev builds:** `npx expo start` + Expo Go for quick iteration
  (SDK-only APIs). For custom native modules, build a development
  client via `eas build --profile development`.
- **Native builds:** `eas build --platform all --profile production`.
- **OTA updates:** `eas update --branch production` for JS-only fixes
  between native releases. Bump `runtimeVersion` in `app.json` when
  shipping a native change to invalidate old OTA bundles.
- **Store submission:** `eas submit` after a production build, once
  the store listing is ready.
