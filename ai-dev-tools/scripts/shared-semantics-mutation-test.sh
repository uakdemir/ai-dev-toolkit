#!/usr/bin/env bash
# Mutation-tests check-shared-semantics.cjs.
#
# A gate that is merely red today proves nothing: so is a gate that always fails. This proves, in
# order --
#
#   1. the gate is RED on the real, unfixed plugin tree
#   2. the gate is GREEN on a minimal tree where the contract holds
#   3. the gate goes RED under each EVASION a reviewer might reach for instead of fixing the rule
#   4. the gate goes RED when the CONTRACT ITSELF is broken (checks A, C and D)
#   5. the gate stays GREEN on constructs that only look like the bug
#
# Steps 3 and 4 are the ones that matter. Testing a gate against the bug it was written from proves
# only that the author can grep.
#
# Usage:  ./mutation-test.sh [path-to-ai-dev-tools]

set -uo pipefail
GATE="$(cd "$(dirname "$0")" && pwd)/check-shared-semantics.cjs"
REAL_PLUGIN="${1:-/home/umut/projects/interview/learning-cache/python/ai-dev-toolkit/ai-dev-tools}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/sevgate.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# 17 of the 23 cases below assert exit 1. `node <missing>.cjs` also exits 1, so without this
# preflight a suite pointed at a nonexistent gate would report 17 PASS while testing nothing.
# (`expect red` requires rc == 1 exactly, and the gate now exits 2 when it cannot run, so a
# crashing gate no longer scores as caught either.)
[ -f "$GATE" ] || { printf 'cannot run: gate not found at %s\n' "$GATE" >&2; exit 2; }
[ -d "$REAL_PLUGIN/skills" ] || { printf 'cannot run: no skills/ under %s\n' "$REAL_PLUGIN" >&2; exit 2; }

pass=0; fail=0
ok()  { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }

expect_rc() {  # expect_rc <code> <root> <label>
  local want="$1" root="$2" label="$3"
  node "$GATE" "$root" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq "$want" ]; then ok "$label"; else bad "$label (wanted exit $want, gate exited $rc)"; fi
}

expect() {  # expect <red|green> <root> <label>
  local want="$1" root="$2" label="$3"
  node "$GATE" "$root" >/dev/null 2>&1
  local rc=$?
  if [ "$want" = red   ] && [ "$rc" -eq 1 ]; then ok "$label"; return; fi
  if [ "$want" = green ] && [ "$rc" -eq 0 ]; then ok "$label"; return; fi
  bad "$label (wanted $want, gate exited $rc)"
}

echo
echo "1. a real tree, before and after the fix"
# Once the fix lands the gate is GREEN on the real plugin, so this case is RE-POINTED at a pinned
# pre-fix copy of that same tree rather than flipped to green. Flipped, it would say exactly what
# case 2 already says, and nothing in the suite would prove the gate goes red on a REAL tree with
# real prose -- which is the only thing separating a working gate from one that always passes.
# The green-on-the-real-tree assertion is added alongside it, not in place of it.
PREFIX_SHA="${PREFIX_SHA:-5153f53}"
REPO="$(git -C "$REAL_PLUGIN" rev-parse --show-toplevel 2>/dev/null)"
PREFIX_TREE="$WORK/prefix"
mkdir -p "$PREFIX_TREE"
if [ -n "$REPO" ] \
   && git -C "$REPO" archive "$PREFIX_SHA" ai-dev-tools 2>/dev/null \
      | tar -x -C "$PREFIX_TREE" --strip-components=1 2>/dev/null \
   && [ -d "$PREFIX_TREE/skills" ]; then
  expect red "$PREFIX_TREE" "gate is RED on the pre-fix tree pinned at $PREFIX_SHA"
else
  bad "gate is RED on the pre-fix tree pinned at $PREFIX_SHA (could not materialise it from git)"
fi
expect green "$REAL_PLUGIN" "gate is GREEN on $REAL_PLUGIN"

BASE="$WORK/base"
RULE_REL="references/shared-rules/severity-is-consequence.md"
build_base() {
  rm -rf "$BASE"
  mkdir -p "$BASE/references/shared-rules" "$BASE/skills/review-fake/prompts"
  cat > "$BASE/$RULE_REL" <<'EOF'
---
name: severity-is-consequence
applies-to: [review-fake]
canonical: Severity is consequence, not certainty.
detector: severity-from-confidence
---

# Severity is consequence, not certainty

**Severity is consequence, not certainty.** Rate `severity` by what actually happens to the user if
the finding is real. Rate `confidence` separately: it is the likelihood the finding is real. The two
axes are independent, and a finding that is uncertain and catastrophic outranks one that is certain
and cosmetic.
EOF
  cat > "$BASE/skills/review-fake/prompts/reviewer.md" <<'EOF'
# Reviewer

**Severity is consequence, not certainty.** Rate every finding on both axes. Severity semantics are
defined once, in `references/shared-rules/severity-is-consequence.md` — read it before rating.

## Output Processing

1. **Deduplicate** — merge findings flagging the same location.
2. **Filter** — drop findings the rule's floor excludes.
3. **Rate** — assign `severity` per the rule, and `confidence` independently.

```json
{
  "issues": [
    {
      "severity": "critical",
      "category": "completeness",
      "location": "Section 3.2",
      "confidence": 85,
      "problem": "…",
      "suggested_fix": "…"
    }
  ]
}
```
EOF
}
build_base
echo
echo "2. a minimal tree where the contract holds"
expect green "$BASE" "gate is GREEN on a compliant tree"

TARGET_REL="skills/review-fake/prompts/reviewer.md"
mutate() {  # mutate <label>  (mutation text on stdin, appended to the reviewer prompt)
  local label="$1"
  build_base
  cat >> "$BASE/$TARGET_REL"
  expect red "$BASE" "$label"
}

echo
echo "3. evasions — each must put the gate back to RED"

mutate "E1  the original spelling" <<'EOF'

3. **Categorize by severity** using confidence score:
   - confidence >= 80 → `"critical"`
   - confidence 60-79 → `"high"`
EOF

mutate "E2  reworded into prose, no operators" <<'EOF'

When the confidence score is 80 or above, mark the finding `"critical"`; between 60 and 79 it is
`"high"`.
EOF

mutate "E3  unicode comparison operator" <<'EOF'

Severity follows the confidence score: confidence ≥ 80 → `critical`.
EOF

mutate "E4  restated as a markdown table" <<'EOF'

| confidence | severity |
|---|---|
| >= 80 | critical |
| 60-79 | high |
EOF

mutate "E5  paired assignment, no threshold at all" <<'EOF'

For each verdict, append an issue:
   - INACCURATE → confidence 85, severity "critical"
   - STALE → confidence 70, severity "high"
EOF

mutate "E6  'set both' preamble with the arrows reworded" <<'EOF'

   - Set both `confidence` and `severity` from the verdict, using the table in the appendix.
EOF

mutate "E7  hidden inside a json fence" <<'EOF'

```json
{"rule": "severity \"critical\" when confidence 80"}
```
EOF

build_base
cat >> "$BASE/skills/review-fake/SKILL.md" <<'EOF'
# Review-fake

Severity is derived from the confidence score: confidence >= 80 → `"critical"`.
EOF
expect red "$BASE" "E8  relocated into SKILL.md"

build_base
mkdir -p "$BASE/skills/review-fake/agents"
cat > "$BASE/skills/review-fake/agents/fact-checker.md" <<'EOF'
# Fact checker

   - Set both `confidence` and `severity`:
     - INACCURATE → confidence 85, severity "critical"
EOF
expect red "$BASE" "E9  relocated into a new agents/ file"

echo
echo "4. the contract itself — checks A, C and D"

# C: the rule governs the skill, but the skill never points at it. "Delete the rule and say nothing."
build_base
sed -i 's|`references/shared-rules/severity-is-consequence.md` — read it before rating.|nowhere in particular.|' "$BASE/$TARGET_REL"
expect red "$BASE" "C1  governed skill stops referencing the rule"

# D: a NEW sibling skill starts rating severities without joining the contract. This is the fork,
# caught on the day it is written rather than a year later.
build_base
mkdir -p "$BASE/skills/review-plan/prompts"
cat > "$BASE/skills/review-plan/prompts/reviewer.md" <<'EOF'
# Reviewer for plans

Emit issues with `severity: "critical"` for anything that blocks execution.
EOF
expect red "$BASE" "D1  a new sibling skill rates severity but is not in applies-to"

# D2: check D asks whether a skill PRODUCES findings outside the contract. A non-governed skill's
# references/ tree is reference material, and in the real corpus it is where `severity` tokens from
# other domains live -- .editorconfig analyzer levels, `suggested_severity` for lint conventions, a
# `count(severity == "critical")` formula. Measured on the real plugin, scanning those produced
# three false positives in skills with no confidence axis at all.
build_base
mkdir -p "$BASE/skills/lint-tuner/references"
cat > "$BASE/skills/lint-tuner/references/rule-mappings.md" <<'EOF'
# Linter rule mappings

```ini
dotnet_diagnostic.CA2200.severity = warning
```

- **Suggested severity:** `high`
EOF
expect green "$BASE" "D2  a non-governed skill's references/ tree is not a coverage violation"

# D3: and the narrowing applies to check D only. Inside a GOVERNED skill, check B still reads every
# file, references/ included -- otherwise D2 would have opened a hiding place.
build_base
mkdir -p "$BASE/skills/review-fake/references"
cat > "$BASE/skills/review-fake/references/severity-bands.md" <<'EOF'
# Severity bands

   - confidence >= 80 → `"critical"`
   - confidence 60-79 → `"high"`
EOF
expect red "$BASE" "D3  the mapping relocated into a GOVERNED skill's references/ is still caught"

# A: the rule file loses its own canonical sentence.
build_base
sed -i 's|\*\*Severity is consequence, not certainty\.\*\* Rate|Rate|' "$BASE/$RULE_REL"
sed -i 's|^# Severity is consequence, not certainty$|# Severity|' "$BASE/$RULE_REL"
expect red "$BASE" "A1  rule file loses its canonical sentence"

# A': the mapping hides in the one file exempt from the detector.
build_base
cat >> "$BASE/$RULE_REL" <<'EOF'

As a rough guide, a finding with confidence 80 is usually worth escalating.
EOF
expect red "$BASE" "A2  a threshold hidden in the rule file, which the detector exempts"

# Registry extensibility: a second shared rule, no detector, properly referenced.
build_base
cat > "$BASE/references/shared-rules/counts-exclude-self-review.md" <<'EOF'
---
name: counts-exclude-self-review
applies-to: [review-fake]
canonical: Counts measure the artefact under review, never the review loop's own edits.
---

**Counts measure the artefact under review, never the review loop's own edits.**
EOF
cat >> "$BASE/$TARGET_REL" <<'EOF'

**Counts measure the artefact under review, never the review loop's own edits.**
Counting rules: `references/shared-rules/counts-exclude-self-review.md`.
EOF
expect green "$BASE" "R1  a second shared rule with no detector extends the registry cleanly"

build_base
cat > "$BASE/references/shared-rules/orphan.md" <<'EOF'
---
name: orphan
applies-to: [review-fake]
canonical: This sentence is nowhere to be found.
---

Some other text entirely.
EOF
# Reference it, so check C is satisfied and only check A can fire.
echo 'See `references/shared-rules/orphan.md`.' >> "$BASE/$TARGET_REL"
expect red "$BASE" "R2  a rule whose canonical sentence is missing from its own body"

echo
echo "5. negative controls — these must stay GREEN"

build_base
cat >> "$BASE/$TARGET_REL" <<'EOF'

## Schema

```json
"properties": {
  "severity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
  "confidence": { "type": "integer", "minimum": 40, "maximum": 100 }
}
```
EOF
expect green "$BASE" "N1  a JSON schema declaring both fields as siblings"

build_base
cat >> "$BASE/$TARGET_REL" <<'EOF'

Regressions are injected as synthetic issues carrying all six required fields:
`severity: "critical"`, `category: "bug"`, `location: "<cmd>"`, `confidence: 85`,
`problem: "…"`, `suggested_fix: "…"`.
EOF
expect green "$BASE" "N2  a worked example record with both fields set to constants"

build_base
cat >> "$BASE/$TARGET_REL" <<'EOF'

Report findings with `confidence` >= 40. A high-severity finding below that threshold should be
investigated until it can be grounded or dropped, not silently discarded.
EOF
expect green "$BASE" "N3  a reporting floor stated without a severity mapping"

echo
echo "6. defects found by the Step 0 payload review — each must stay fixed"

# F1: check B is the gate's only substantive check, and it missed the plainest English statements
# of the rule. Every one of these left the gate GREEN before the fix.
mutate "F1a plain prose: '>= 80 are critical'" <<'EOF'

Findings with confidence >= 80 are critical.
EOF

mutate "F1b trailing qualifier: '80 or above'" <<'EOF'

When the confidence score is 80 or above, mark the finding `"critical"`.
EOF

mutate "F1c trailing qualifier: '80 or more'" <<'EOF'

A finding with a confidence score of 80 or more is `"critical"`.
EOF

mutate "F1d plus form: 'confidence 80+'" <<'EOF'

- confidence 80+ → `"critical"`
EOF

mutate "F1e derivation stated with no number at all" <<'EOF'

Derive `severity` from the `confidence` tier using the appendix table.
EOF

mutate "F1f 'assign both', without the literal bigram 'set both'" <<'EOF'

Assign both `confidence` and `severity` from the verdict class.
EOF

# F12: check C tests only that the rule's PATH occurs. A skill could cite the rule and state its
# exact inverse, with no number and no markup, and stay green.
build_base
sed -i 's|\*\*Severity is consequence, not certainty\.\*\* Rate every|Severity is certainty, not consequence. Rate every|' "$BASE/$TARGET_REL"
expect red "$BASE" "F12 governed skill cites the rule but never states its canonical sentence"

# F2: an EMPTY registry directory left every check vacuous and still printed the success sentence.
build_base
rm -f "$BASE/$RULE_REL"
expect red "$BASE" "F2  an empty references/shared-rules/ is not a passing contract"

# F3: isReferenceFile tested every ancestor of an absolute path, so a plugin rooted anywhere under
# a directory named `references` silently turned check D off.
build_base
NESTED="$WORK/references/nested"
rm -rf "$NESTED"; mkdir -p "$(dirname "$NESTED")"; cp -r "$BASE" "$NESTED"
mkdir -p "$NESTED/skills/review-plan/prompts"
cat > "$NESTED/skills/review-plan/prompts/reviewer.md" <<'EOF'
# Reviewer for plans

Emit issues with `severity: "critical"` for anything that blocks execution.
EOF
expect red "$NESTED" "F3  check D still fires when the tree sits under a dir named 'references'"

# F4: two trees no check reached — the plugin-root references/ tree (where shared prose already
# lives) and a non-governed skill's references/ tree — plus a governed skill's non-.md prompt.
build_base
mkdir -p "$BASE/references/common"
cat > "$BASE/references/common/rating-guide.md" <<'EOF'
# Rating guide

   - confidence >= 80 → `"critical"`
EOF
expect red "$BASE" "F4a a mapping in the plugin-root references/ tree is caught"

build_base
mkdir -p "$BASE/skills/lint-tuner/references"
cat > "$BASE/skills/lint-tuner/references/bands.md" <<'EOF'
# Bands

   - confidence >= 80 → `"critical"`
EOF
expect red "$BASE" "F4b a mapping in a non-governed skill's references/ tree is caught"

build_base
cat > "$BASE/skills/review-fake/prompts/reviewer.txt" <<'EOF'
   - confidence >= 80 → `"critical"`
EOF
expect red "$BASE" "F4c a governed skill's non-Markdown prompt is scanned"

# F5: A' anchored on the literal token "confidence" before the number, and ran only for
# detector-bearing rules.
build_base
cat >> "$BASE/$RULE_REL" <<'EOF'

Bands:
   - `"critical"` when the score is at least 80
EOF
expect red "$BASE" "F5a a threshold in the rule file that never says 'confidence'"

build_base
cat > "$BASE/references/shared-rules/counts-exclude-self-review.md" <<'EOF'
---
name: counts-exclude-self-review
applies-to: [review-fake]
canonical: Counts measure the artefact under review, never the review loop's own edits.
---

**Counts measure the artefact under review, never the review loop's own edits.**

   - confidence >= 80 → `"critical"`
EOF
cat >> "$BASE/$TARGET_REL" <<'EOF'

**Counts measure the artefact under review, never the review loop's own edits.**
Counting rules: `references/shared-rules/counts-exclude-self-review.md`.
EOF
expect red "$BASE" "F5b a threshold in a rule file that declares no detector"

# F7: the fence toggle flipped on any ``` line, so one nested fence exempted the rest of the file.
build_base
printf '\n````markdown\n```\n````\n\n   - confidence >= 80 → `"critical"`\n' >> "$BASE/$TARGET_REL"
expect red "$BASE" "F7  a nested code fence does not exempt the rest of the file"

# F13: the gate promises exit 2 for "cannot run". Unguarded file IO made that a 1, which every
# `expect red` in this suite would have scored as a caught violation.
build_base
chmod 000 "$BASE/$TARGET_REL"
expect_rc 2 "$BASE" "F13 an unreadable file exits 2 (cannot run), not 1 (violated)"
chmod 644 "$BASE/$TARGET_REL"

# The --print-coverage flag added for check-detector-coverage.sh is output-only. If it ever changed
# the verdict, the snapshot test and the gate would disagree about the same tree.
build_base
node "$GATE" --print-coverage "$BASE" >/dev/null 2>&1
rc_flag=$?
node "$GATE" "$BASE" >/dev/null 2>&1
rc_plain=$?
if [ "$rc_flag" -eq "$rc_plain" ]; then
  ok "P1  --print-coverage does not change the verdict (green tree)"
else
  bad "P1  --print-coverage changed the verdict (green tree): $rc_plain -> $rc_flag"
fi

build_base
cat >> "$BASE/$TARGET_REL" <<'EOF'

   - confidence >= 80 → `"critical"`
EOF
node "$GATE" --print-coverage "$BASE" >/dev/null 2>&1
rc_flag=$?
node "$GATE" "$BASE" >/dev/null 2>&1
rc_plain=$?
if [ "$rc_flag" -eq "$rc_plain" ] && [ "$rc_plain" -eq 1 ]; then
  ok "P2  --print-coverage does not change the verdict (red tree)"
else
  bad "P2  --print-coverage changed the verdict (red tree): $rc_plain -> $rc_flag"
fi

echo
echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ] || exit 1
