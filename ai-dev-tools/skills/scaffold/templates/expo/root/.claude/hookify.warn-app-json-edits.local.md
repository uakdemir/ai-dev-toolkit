---
name: warn-app-json-edits
enabled: true
event: write
pattern: (^|/)app\.json$
action: warn
---

**Editing `app.json` — this requires an EAS rebuild.**

Changes to `app.json` (plugins, permissions, bundle ID, SDK version,
config-plugin options) cannot be shipped via `eas update` (OTA). The
next release must be a full `eas build --platform all` so the changes
land in the native binary.

Before committing `app.json` edits:
1. Confirm the change is actually needed (versus a JS-only workaround).
2. Flag it in the commit message so release managers know a new build
   is required.
3. Bump the `runtimeVersion` if the change affects OTA compatibility.
