#!/usr/bin/env bash
# TDD harness for the count-exclusion invariant:
#
#     critical_count and high_count count findings in the DOCUMENT UNDER REVIEW.
#     Findings the review loop introduced in its own fix pass (origin: "self-review")
#     are reported, but never counted.
#
# This is the machine-checkable half of the churn fix. Three pipeline gates read `critical_count`
# (stage-iii early-exit, stage-i and stage-iii unresolved-criticals --
# skills/orchestrate/references/common/error-logs-format.md), and the unresolved-criticals gate stops
# the run at "any critical remaining". Without this invariant enforced at the artefact, the loop's own
# churn can fail the auto-pipeline, and nothing catches it.
#
# `origin` is the ONLY per-issue flag. A second field, `phase`, recorded which pass found a finding;
# it existed solely because rounds carried findings forward and flipped `origin` at the boundary,
# destroying that record. Rounds now start fresh, so `origin` never changes and `phase` is gone --
# case 5 pins its removal.
#
# RED TODAY, on purpose, for both reasons the fix must address:
#   1. the validator has no doc schema, so it rejects a review-doc.json outright, and
#   2. it has no notion of origin, so it accepts an inflated count.
#
# Usage:  ./count-exclusion-test.sh <path-to-ai-dev-tools>

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="${1:-/home/umut/projects/interview/learning-cache/python/ai-dev-toolkit/ai-dev-tools}"
FIX="$HERE/../tests/fixtures/counts"

# The validator invocation the fix is expected to provide. If the toolkit session chooses a sibling
# script over a --schema flag, change this one line and nothing else in the test.
validate() { node "$PLUGIN/scripts/validate-review-json.cjs" --schema doc "$1"; }

# 3 of the 4 cases assert exit 1, and `node <missing>.cjs` also exits 1 — so without this a suite
# pointed at a nonexistent validator would report three PASSes having validated nothing.
[ -f "$PLUGIN/scripts/validate-review-json.cjs" ] || {
  printf 'cannot run: validator not found under %s/scripts/\n' "$PLUGIN" >&2; exit 2; }
[ -d "$FIX" ] || { printf 'cannot run: fixtures not found at %s\n' "$FIX" >&2; exit 2; }

pass=0; fail=0
ok()  { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }

# expect <accept|reject> <fixture> <label>
expect() {
  local want="$1" file="$2" label="$3"
  validate "$FIX/$file" >/dev/null 2>&1
  local rc=$?
  if [ "$want" = accept ] && [ "$rc" -eq 0 ]; then ok "$label"; return; fi
  if [ "$want" = reject ] && [ "$rc" -eq 1 ]; then ok "$label"; return; fi
  bad "$label (wanted $want, validator exited $rc)"
}

echo
echo "count-exclusion invariant"
echo "  fixtures hold 2 document criticals and 3 self-review criticals"
echo "  plus the next-round artefact, where the same findings are ordinary document text"
expect reject churn-inflated.json     "critical_count 5 counts the loop's own churn -> rejected"
expect accept churn-excluded.json     "critical_count 2 counts only the document -> accepted"
expect reject churn-undercounted.json "critical_count 1 drops a real document critical -> rejected"

# The exclusion is ROUND-LOCAL, and with no carry-forward that is enforced by construction: a later
# round re-reviews the whole artefact and reports what IT finds, so lines an earlier round's fixer
# wrote arrive as ordinary document text. This fixture is that round -- five findings, every one
# origin "document", all five counted. Without it the suite would equally pass an implementation
# that suppressed self-review findings forever, which is a different -- and wrong -- rule.
expect accept churn-next-round.json    "a later round counts all five as document-origin -> accepted"

# `phase` was removed with carry-forward. An artifact still carrying it is rejected rather than
# tolerated: the key is not in ISSUE_OPTIONAL, and additionalProperties is false. Silently accepting
# it would let a stale producer keep emitting a field nothing reads, which is how the two-rule
# counting contradiction survived unnoticed in the first place.
expect reject churn-phase-tagged.json  "an artifact still carrying the removed \`phase\` key -> rejected"

echo
echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ] || exit 1
