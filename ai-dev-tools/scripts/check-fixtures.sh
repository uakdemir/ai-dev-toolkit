#!/usr/bin/env bash
# Verifies the read-only test fixtures are byte-identical to what they were committed as.
#
# The fixtures encode the eval's oracle: EXPECTATIONS.json says which planted defect belongs in
# which cell, and the three documents are where those defects live. A review round pointed at them
# will happily edit them -- the fix phase and the always-on self-review pass both write to whatever
# they are given -- and a silently-edited fixture turns the eval into a measurement of nothing,
# while still printing EVAL PASSED.
#
# Usage:  ./check-fixtures.sh [path-to-ai-dev-tools]

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="${1:-$HERE/..}"
# Resolve both to absolute paths BEFORE the cd -- the checksums are recorded relative to the
# plugin root, so verification has to run from there, and a relative $SUMS would not survive it.
PLUGIN="$(cd "$PLUGIN" 2>/dev/null && pwd)" || { printf 'cannot run: plugin root not a directory\n' >&2; exit 2; }
SUMS="$PLUGIN/tests/fixtures/CHECKSUMS.sha256"

[ -f "$SUMS" ] || { printf 'cannot run: no checksum file at %s\n' "$SUMS" >&2; exit 2; }

cd "$PLUGIN" || { printf 'cannot run: %s not a directory\n' "$PLUGIN" >&2; exit 2; }
if out="$(sha256sum -c "$SUMS" 2>&1)"; then
  printf '  \033[32mPASS\033[0m  %s fixture files unchanged\n' "$(grep -c . "$SUMS")"
  exit 0
fi

printf '  \033[31mFAIL\033[0m  fixtures have been modified\n\n'
printf '%s\n' "$out" | grep -v ': OK$' | sed 's/^/    /'
printf '\nFixtures are read-only oracle data. If a review round edited them, restore them from git.\n'
printf 'If the change was deliberate, regenerate with:\n'
printf '  cd %s && find tests/fixtures -type f ! -name CHECKSUMS.sha256 | sort | xargs sha256sum > tests/fixtures/CHECKSUMS.sha256\n' "$PLUGIN"
exit 1
