# `lib/sentry/` — Sentry SDK boundary

## What this is for

Sentry owns **crash reporting, error tracking, and performance
monitoring**: unhandled exceptions, React component errors, native
crashes, and transaction traces.

## API key configuration

- Sentry DSN lives in EAS Secrets (`SENTRY_DSN`) and is wired via the
  Sentry Expo config plugin in `app.json`:

  ```json
  {
    "expo": {
      "plugins": [
        ["@sentry/react-native/expo", {
          "url": "https://sentry.io/",
          "organization": "<org>",
          "project": "<project>"
        }]
      ]
    }
  }
  ```

## Canonical usage patterns

```ts
// lib/sentry/client.ts
import * as Sentry from '@sentry/react-native';

export function initSentry() {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    enableNative: true,
  });
}

export function setUser(userId: string) {
  Sentry.setUser({ id: userId });
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(err, { extra: context });
}
```

```tsx
// app/_layout.tsx — wrap root in Sentry.ErrorBoundary
import * as Sentry from '@sentry/react-native';
export default Sentry.wrap(RootLayout);
```

## What NOT to do

- **Do not call `@sentry/react-native` from outside `lib/sentry/` for
  init or user-context ops.** Ad-hoc `Sentry.captureException` at catch
  sites is fine — that's the point of the SDK. Use the helper above to
  keep the shape consistent.
- **Do not log PII in `extra` / `tags`.** Scrub before capture.
- **Do not ship with `tracesSampleRate: 1.0` in production.** Sampling
  1.0 in prod is expensive and can leak PII via breadcrumbs.

## Provider docs

- https://docs.sentry.io/platforms/react-native/manual-setup/expo/

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
