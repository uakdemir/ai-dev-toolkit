---
name: warn-package-json-deps
enabled: true
event: write
pattern: ^package\.json$
action: warn
---

**Editing `package.json` dependencies directly.**

Expo wraps `npm install` as `npx expo install` to resolve compatible
SDK versions. Adding a dependency by hand-editing `package.json` can
pull in a version incompatible with the current Expo SDK.

Preferred flow:
```bash
npx expo install <package>
```

`npx expo install` looks up the package in Expo's compatibility matrix
and picks the version that matches the installed SDK. Only hand-edit
`package.json` for packages Expo doesn't know about, and then pin the
version explicitly.
