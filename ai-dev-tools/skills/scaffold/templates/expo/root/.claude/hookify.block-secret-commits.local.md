---
name: block-secret-commits
enabled: true
event: write
pattern: (^|/)(\.env(\.[^.]+)?|.*secret.*\.(ya?ml|json|env))$
action: block
---

**Blocked: potential secret file.**

Files matching `.env`, `.env.*`, or names containing `secret` with a
yaml/json/env extension are high-risk for leaking credentials. Do NOT
commit hardcoded API keys, access tokens, or credentials to these
files.

Correct patterns:
- Build-time secrets → `eas secret:create` (EAS Secrets), referenced
  in `eas.json` via `$MY_SECRET` syntax.
- Runtime secrets → Supabase env vars or a secrets management service;
  fetched at runtime, never embedded in the bundle.
- Local development → `.env.local` (gitignored) + `expo-env` or
  `react-native-dotenv` for local-only use.

Note: `eas.json` is NOT blocked here — every Expo project must author
and maintain `eas.json` (build profiles, submit config, `$SECRET_NAME`
references). Review `eas.json` commits manually for hardcoded secret
values, or use a pre-commit secret scanner (e.g., gitleaks) to catch
them automatically.
