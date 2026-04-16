# `lib/posthog/` — PostHog SDK boundary

## What this is for

PostHog owns **product analytics**: event tracking, funnels, feature
flags, experiments, and session replay (if enabled).

## API key configuration

- Public project key lives in EAS Secrets (`POSTHOG_API_KEY`) and is
  injected at build time via `eas.json` → `env`.
- Host URL (`posthog.com` vs `eu.posthog.com`) lives in the same env
  config — pick one at project start and do not change without a
  migration plan.

## Canonical usage patterns

```ts
// lib/posthog/client.ts
import PostHog from 'posthog-react-native';

export const posthog = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });

export function trackEvent(name: string, props?: Record<string, unknown>) {
  posthog.capture(name, props);
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  posthog.identify(userId, traits);
}
```

```ts
// Feature flag usage
const isBetaEnabled = posthog.isFeatureEnabled('new-onboarding');
```

## What NOT to do

- **Do not call `posthog-react-native` from outside `lib/posthog/`.**
  Every screen tracks events via `trackEvent(...)` so we can rename or
  swap providers in one place.
- **Do not send PII.** User email, phone, full name must not appear in
  event properties. Hashed or pseudonymous IDs only.
- **Do not track high-cardinality props.** Keep props to bounded
  enumerations — PostHog charges per event and per-property indexing
  degrades with unbounded cardinality.

## Provider docs

- https://posthog.com/docs/libraries/react-native

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
