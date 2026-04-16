---
name: block-secret-commits
enabled: true
event: write
pattern: (secret|\.env$|eas\.json)
action: block
---

**Blocked: potential secret in a tracked file.**

Files matching `*secret*`, `*.env`, or `eas.json` are high-risk for
leaking credentials. Do NOT commit hardcoded API keys, access tokens,
or credentials to these files.

Correct patterns:
- Build-time secrets → `eas secret:create` (EAS Secrets), referenced
  in `eas.json` via `$MY_SECRET` syntax.
- Runtime secrets → Supabase env vars or a secrets management service;
  fetched at runtime, never embedded in the bundle.
- Local development → `.env.local` (gitignored) + `expo-env` or
  `react-native-dotenv` for local-only use.

If this write is a legitimate reference to a secret NAME (not value),
proceed manually. Otherwise, cancel and use EAS Secrets.
