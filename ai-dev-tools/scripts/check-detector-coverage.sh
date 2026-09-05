#!/usr/bin/env bash
# Snapshot test for check-shared-semantics.cjs's coverage predicate.
#
# Check D's two worst defects had one root cause: `governs()` was reasoned about but never run over
# the real corpus. It fired on three sites that are not the governed thing at all (an .editorconfig
# analyzer level, a `suggested_severity` lint field, a `count(severity == "critical")` formula), and
# check B missed six plain-English statements of its own rule. Both were invisible because nothing
# recorded what the predicate actually matched.
#
# This pins that list. It fails when a skill starts or stops looking like a severity rater --
# which is either a new sibling that must join the contract, or a false positive to fix.
#
# Usage:  ./check-detector-coverage.sh [path-to-ai-dev-tools]

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="${1:-$HERE/..}"
GATE="$HERE/check-shared-semantics.cjs"
BASELINE="$HERE/../tests/detector-coverage.txt"

[ -f "$GATE" ]     || { printf 'cannot run: gate not found at %s\n' "$GATE" >&2; exit 2; }
[ -f "$BASELINE" ] || { printf 'cannot run: baseline not found at %s\n' "$BASELINE" >&2; exit 2; }

actual="$(node "$GATE" --print-coverage "$PLUGIN" 2>/dev/null | sed -n '/^detector/,/^shared rules/p' | sed '/^shared rules/d')"
[ -n "$actual" ] || { printf 'cannot run: gate produced no coverage output\n' >&2; exit 2; }

if diff -u "$BASELINE" <(printf '%s\n' "$actual") > /tmp/.coverage-diff 2>&1; then
  printf '  \033[32mPASS\033[0m  detector coverage matches tests/detector-coverage.txt\n'
  rm -f /tmp/.coverage-diff
  exit 0
fi

printf '  \033[31mFAIL\033[0m  detector coverage changed\n\n'
cat /tmp/.coverage-diff
rm -f /tmp/.coverage-diff
printf '\nA file GAINED means a skill now looks like a severity rater: either it must join a rule'\''s\n'
printf '`applies-to`, or the detector has a new false positive. A file LOST means a skill stopped\n'
printf 'rating severities, or the detector went blind to it. Decide which, then update the baseline.\n'
exit 1
