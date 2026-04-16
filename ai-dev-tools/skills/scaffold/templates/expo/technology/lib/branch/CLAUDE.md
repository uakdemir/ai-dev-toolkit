# `lib/branch/` — Branch.io SDK boundary

## What this is for

Branch owns **deferred deep links and install attribution**: a link
tapped before the app is installed can still open the correct in-app
screen after first launch, and the attribution is tied to the
install-source campaign.

## API key configuration

- Branch key (live + test) lives in EAS Secrets
  (`BRANCH_LIVE_KEY`, `BRANCH_TEST_KEY`). Injected at build time via
  `app.json` config plugin and `eas.json` env.

## Canonical usage patterns

```ts
// lib/branch/client.ts
import branch from 'react-native-branch';

export function initBranch() {
  branch.subscribe(({ error, params }) => {
    if (error) return;
    if (params && params['+clicked_branch_link']) {
      handleBranchLink(params);
    }
  });
}

function handleBranchLink(params: Record<string, unknown>) {
  // Route user to intended deep-link target
}

export async function createLink(data: Record<string, unknown>) {
  const bu = await branch.createBranchUniversalObject('share_' + Date.now(), data);
  const { url } = await bu.generateShortUrl({});
  return url;
}
```

## In-app vs deferred links — rule of thumb

- **In-session navigation:** use Expo Router + Expo Linking.
- **Links shared externally, may trigger install:** use Branch.

## What NOT to do

- **Do not call `react-native-branch` from outside `lib/branch/`.**
- **Do not use Branch for in-app navigation when the user is already in
  the app.** Overhead is unnecessary; Expo Router is faster and free.
- **Do not log Branch params as-is.** Campaign params may include
  tokenised IDs that reveal attribution data — scrub before logging.

## Provider docs

- https://help.branch.io/developers-hub/docs/react-native

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
