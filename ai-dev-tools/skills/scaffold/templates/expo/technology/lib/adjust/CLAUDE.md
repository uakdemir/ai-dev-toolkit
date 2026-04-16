# `lib/adjust/` — Adjust SDK boundary

## What this is for

Adjust owns **install and in-app event attribution** for paid-media
campaigns (Meta, Google, TikTok, Apple Search Ads). Unlike Branch
(which does deferred linking), Adjust focuses on attribution
reporting and conversion events for ad networks.

## API key configuration

- Adjust App Token lives in EAS Secrets (`ADJUST_APP_TOKEN`).
  Environment (sandbox vs production) is toggled per build profile in
  `eas.json`.

## Canonical usage patterns

```ts
// lib/adjust/client.ts
import { Adjust, AdjustConfig, AdjustEvent } from 'react-native-adjust';

export function initAdjust(env: 'production' | 'sandbox') {
  const cfg = new AdjustConfig(
    ADJUST_APP_TOKEN,
    env === 'production'
      ? AdjustConfig.EnvironmentProduction
      : AdjustConfig.EnvironmentSandbox,
  );
  Adjust.create(cfg);
}

export function trackAdjustEvent(token: string, revenue?: number, currency?: string) {
  const evt = new AdjustEvent(token);
  if (revenue != null && currency) evt.setRevenue(revenue, currency);
  Adjust.trackEvent(evt);
}
```

## What NOT to do

- **Do not call `react-native-adjust` from outside `lib/adjust/`.**
- **Do not duplicate events across PostHog and Adjust.** Adjust is for
  attribution-meaningful events only (install, trial_start, purchase).
  PostHog handles funnel analytics; Adjust handles paid-media ROI.
- **Do not ship sandbox env to production builds.** Double-check
  `eas.json` env per profile before a production build.

## Provider docs

- https://help.adjust.com/en/article/react-native-sdk

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
