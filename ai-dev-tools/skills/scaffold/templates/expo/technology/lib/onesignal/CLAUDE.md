# `lib/onesignal/` — OneSignal SDK boundary

## What this is for

OneSignal owns **push notifications**: device registration, tags,
segment-based campaigns, and in-app messages.

## API key configuration

- OneSignal App ID (public) lives in EAS Secrets (`ONESIGNAL_APP_ID`)
  and is injected at build time.
- OneSignal REST API key (server-side, for tag updates) lives ONLY in
  Supabase Edge Function env vars. Never in the app bundle.

## Canonical usage patterns

```ts
// lib/onesignal/client.ts
import { OneSignal } from 'react-native-onesignal';

export function initOneSignal() {
  OneSignal.initialize(ONESIGNAL_APP_ID);
  OneSignal.Notifications.requestPermission(true);
}

export function setUserId(userId: string) {
  OneSignal.login(userId);
}

export function setTags(tags: Record<string, string>) {
  OneSignal.User.addTags(tags);
}
```

## Integration with RevenueCat

Entitlement-gated notifications flow:
```
RevenueCat webhook → Supabase Edge Function → OneSignal REST API (set tag)
```
Client never writes entitlement tags directly.

## What NOT to do

- **Do not call `react-native-onesignal` from outside `lib/onesignal/`.**
- **Do not write PII to tags.** Use IDs and non-PII labels only.
  OneSignal tags are visible to anyone with dashboard access.
- **Do not request notification permission at app start.** Prompt in
  context (after the first meaningful value moment) — iOS permission
  dialogs are one-shot.

## Provider docs

- https://documentation.onesignal.com/docs/react-native-sdk-setup

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
