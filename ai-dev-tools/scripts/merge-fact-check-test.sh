#!/usr/bin/env bash
# TDD harness for scripts/merge-fact-check.cjs -- the merge that lets review-doc's fact-checker run
# alongside the reviewer instead of after it.
#
# The fact-checker writes its own artifact; the merge appends its issues to the reviewer's, numbers
# them from the reviewer's highest id + 1, copies the claims and the accuracy, recounts the gate
# counts with self-review findings excluded (references/shared-rules/counts-exclude-self-review.md),
# and validates the result before it replaces the review JSON. Every case below runs in a scratch
# copy: the merge renames its output over its first argument, and a rewritten fixture would fail
# check-fixtures.sh.
#
# Usage:  ./merge-fact-check-test.sh [path-to-ai-dev-tools]
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="${1:-$HERE/..}"
PLUGIN="$(cd "$PLUGIN" 2>/dev/null && pwd)" || { printf 'cannot run: plugin root not a directory\n' >&2; exit 2; }
MERGE="$PLUGIN/scripts/merge-fact-check.cjs"
VALIDATE="$PLUGIN/scripts/validate-review-json.cjs"
FIX="$PLUGIN/tests/fixtures/fact-check-merge"
# Several cases assert exit 1, and `node <missing>.cjs` also exits 1 -- so without these guards a
# suite pointed at a missing script would report PASSes having merged nothing.
[ -f "$MERGE" ]    || { printf 'cannot run: merge script not found at %s\n' "$MERGE" >&2; exit 2; }
[ -f "$VALIDATE" ] || { printf 'cannot run: validator not found at %s\n' "$VALIDATE" >&2; exit 2; }
[ -d "$FIX" ]      || { printf 'cannot run: fixtures not found at %s\n' "$FIX" >&2; exit 2; }

pass=0; fail=0
ok()  { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# stage <case> <review-fixture> [fact-check-fixture]: copy the fixtures into a fresh case directory.
stage() {
  mkdir -p "$WORK/$1"
  cp "$FIX/$2" "$WORK/$1/review.json"
  if [ -n "${3:-}" ]; then cp "$FIX/$3" "$WORK/$1/fact-check.json"; fi
  return 0
}
merge() { node "$MERGE" "$WORK/$1/review.json" "$WORK/$1/fact-check.json" >/dev/null 2>&1; }
# same_json <a> <b>: equal as JSON values, object key order ignored, array order kept.
same_json() {
  node -e '
    const fs = require("fs");
    const canon = (v) => Array.isArray(v) ? v.map(canon)
      : (v && typeof v === "object")
        ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {})
        : v;
    const [a, b] = process.argv.slice(1)
      .map((p) => JSON.stringify(canon(JSON.parse(fs.readFileSync(p, "utf8")))));
    process.exit(a === b ? 0 : 1);
  ' "$1" "$2" 2>/dev/null
}

echo
echo "fact-check merge"

stage renumber review-basic.json fc-basic.json
if merge renumber && same_json "$WORK/renumber/review.json" "$FIX/expected-basic.json"; then
  ok "appends after the reviewer's highest id (ISSUE-005 -> 006, 007); reviewer ids untouched"
else bad "renumbering"; fi

stage recount review-with-self-review.json fc-recount.json
if merge recount && same_json "$WORK/recount/review.json" "$FIX/expected-recount.json"; then
  ok "recount includes fact-check criticals and excludes self-review ones"
else bad "recount"; fi

c3=ok
for fc in "" fc-not-json.txt fc-with-id.json fc-self-review-origin.json; do
  name="invalid-${fc:-missing}"
  stage "$name" review-basic.json "$fc"
  merge "$name"; rc=$?
  if [ "$rc" -ne 1 ] || ! cmp -s "$WORK/$name/review.json" "$FIX/review-basic.json"; then
    c3="${fc:-missing artifact} (exit $rc)"
  fi
done
if [ "$c3" = ok ]; then
  ok "missing, non-JSON, id-carrying and self-review-origin artifacts exit 1, review JSON byte-identical"
else bad "invalid artifact: $c3"; fi

stage empty-fc review-basic.json fc-empty-issues.json
if merge empty-fc && same_json "$WORK/empty-fc/review.json" "$FIX/expected-empty-issues.json"; then
  ok "no fact-check issues: claims and accuracy copied, counts unchanged"
else bad "empty fact-check issues"; fi

if node "$VALIDATE" --schema doc "$WORK/renumber/review.json" >/dev/null 2>&1; then
  ok "merged output passes validate-review-json.cjs --schema doc"
else bad "merged output fails the doc schema"; fi

stage empty-review review-empty.json fc-basic.json
if merge empty-review &&
   [ "$(node -e 'console.log(require(process.argv[1]).issues[0].id)' "$WORK/empty-review/review.json" 2>/dev/null)" = ISSUE-001 ]; then
  ok "empty reviewer array: fact-check ids start at ISSUE-001"
else bad "empty reviewer array"; fi

stage low-conf review-basic.json fc-low-confidence.json
merge low-conf; rc=$?
left="$(ls -A "$WORK/low-conf" | sort | tr '\n' ' ')"
if [ "$rc" -eq 1 ] && cmp -s "$WORK/low-conf/review.json" "$FIX/review-basic.json" &&
   [ "$left" = "fact-check.json review.json " ]; then
  ok "confidence 30 passes the shape check, fails validation: exit 1, review JSON byte-identical, no temp file"
else bad "rejected after merging (exit $rc, directory holds: $left)"; fi

echo
echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ] || exit 1
