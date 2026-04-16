# `lib/revenuecat/` — RevenueCat SDK boundary

## What this is for

RevenueCat owns **subscription and in-app-purchase lifecycle** in this
stack: entitlement checks, purchase flows, receipt validation, renewal
tracking, and webhook delivery to the backend.

## API key configuration

- iOS + Android public SDK keys live in EAS Secrets
  (`REVENUECAT_IOS_KEY`, `REVENUECAT_ANDROID_KEY`) and are injected at
  build time via `eas.json` → `env`.
- The RevenueCat secret key (for backend / webhooks) NEVER appears in
  the app bundle. It lives only in Supabase Edge Function env vars.

## Canonical usage patterns

```ts
// lib/revenuecat/client.ts
import Purchases from 'react-native-purchases';

export function initRevenueCat(userId: string) {
  Purchases.configure({ apiKey: PUBLIC_SDK_KEY, appUserID: userId });
}

export async function getActiveEntitlements() {
  const info = await Purchases.getCustomerInfo();
  return info.entitlements.active;
}

export async function purchase(packageId: string) {
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find(p => p.identifier === packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);
  return Purchases.purchasePackage(pkg);
}
```

## What NOT to do

- **Do not call `react-native-purchases` from outside `lib/revenuecat/`.**
  All screens and features import the helpers above, never the SDK
  directly. This keeps entitlement logic in one place and makes SDK
  version bumps a single-file change.
- **Do not store entitlement state in Zustand or React Query as the
  source of truth.** RevenueCat is the source of truth; UI reads
  `getCustomerInfo()` and caches short-lived.
- **Do not validate receipts client-side.** Use the RevenueCat
  webhook → Supabase Edge Function path to verify purchases
  server-side.

## Provider docs

- https://docs.revenuecat.com/
- https://docs.revenuecat.com/docs/react-native-expo

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
