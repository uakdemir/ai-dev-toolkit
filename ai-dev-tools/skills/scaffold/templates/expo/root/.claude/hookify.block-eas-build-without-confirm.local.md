---
name: block-eas-build-without-confirm
enabled: true
event: bash
pattern: \beas\s+build\b
action: block
---

**Blocked: `eas build` requires explicit user confirmation.**

`eas build` consumes build minutes (paid resource) and takes 15-30
minutes. It is not a routine command — it represents a deliberate
release step.

Do NOT run `eas build` from Claude. Instead:
1. Tell the user the build is ready and list what changed.
2. Let the user decide whether to run `eas build` manually, and with
   which profile (`development`, `preview`, `production`).

For iteration, prefer `eas update` (JS-only OTA), which is free and
ships in seconds.
