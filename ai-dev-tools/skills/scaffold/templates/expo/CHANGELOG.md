# expo — Template CHANGELOG

## v1.0.0

Initial release. Adds Expo (React Native) as a first-class scaffold stack.

### Added
- Root layer: `CLAUDE.md`, `.claude/settings.json`, `.claude/hotspots.md`,
  and eight mobile-tuned hookify rules:
  `hookify.block-git-operations.local.md`,
  `hookify.warn-native-edits.local.md`,
  `hookify.warn-app-json-edits.local.md`,
  `hookify.block-secret-commits.local.md`,
  `hookify.warn-package-json-deps.local.md`,
  `hookify.warn-supabase-migration-skip.local.md`,
  `hookify.block-eas-build-without-confirm.local.md`,
  `hookify.warn-aso-store-listing-edits.local.md`.
- Technology layer: `CLAUDE.md` (appended into root `CLAUDE.md`),
  `.claude/settings.json` (provider-doc allowed hosts, deep-merged into
  root), and eight `lib/<sdk>/CLAUDE.md` placeholders for the standardised
  mobile SDK surface: `revenuecat`, `posthog`, `onesignal`, `branch`,
  `adjust`, `sentry`, `i18n`, `supabase`.
- Package layer: `features/<name>/CLAUDE.md` (write_once) for
  `--add-package` feature scaffolding.
- Placeholder tables documented in the Mobile Scaffold Integration spec
  (Section 3 root + package layer tables).
