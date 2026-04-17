---
name: warn-aso-store-listing-edits
enabled: true
event: write
pattern: (^|/)(store[/_-]?listing|fastlane/metadata|app-store|play-store|screenshots)/
action: warn
---

**Editing store-listing assets (ASO impact).**

Files under `fastlane/metadata/`, `store-listing/`, `screenshots/`, or
similar paths feed App Store Connect and Google Play Console. Changes
affect App Store Optimization (ASO) — keyword ranking, conversion rate,
and screenshot A/B tests.

Before editing:
1. Is this an intentional ASO change (keyword tweak, new screenshot
   variant)? Flag it in the commit message.
2. Are the screenshots device-accurate for the current app version?
   Old screenshots trigger store review rejection.
3. Review changes with the product owner before submitting to the
   store — title/subtitle edits are hard to undo without a new review.
