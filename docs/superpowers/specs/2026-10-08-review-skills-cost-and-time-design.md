# Review skills: cheaper defaults, a fix-effort flag, and a parallel fact-checker

**Date:** 2026-10-08 · **Target release:** ai-dev-tools 5.0.0 · **Skills:** review-doc, review-code (plus restatements in orchestrate, help and two shared rules)

## Why

These numbers come from usage measured across the founder's two working profiles (1,047 sessions, 2026-07-25 to 2026-10-08). The full analysis lives outside the repo, in the session scratchpad: `usage-analysis-2026-10-08.md`.

- **A review round is slow.**
  - review-doc: median 50 min, p90 165 min.
  - review-code: median 42 min, p90 111 min.
  - Total: 87 hours of review wall-clock since 2026-09-23.
- **Max effort doubles the cost.** On Opus 5.5, a max-effort review agent costs about 2× a high-effort one and takes about 2.5× as long: reviewer median $12.53 / 31 min vs $6.30 / 12.5 min. It makes about 55% more API calls.
  - Max does find more: 0.54 vs 0.26 Critical+High per review-code round, at the same cost per serious finding.
  - So max is worth paying for when a missed issue is expensive, and only then.
- **The fix agents are among the most expensive.** At max, the fixer costs a median $11.72 / 33 min and the self-review $6.53 / 22 min. Both apply and check findings that have already been diagnosed.
- **The fact-checker waits for nothing it needs.** In review-doc it verifies the *document's* claims against the code, not the reviewer's findings. It runs after the reviewer only because it appends to the reviewer's JSON.
  - A fact-checked round is therefore a strict four-agent chain: reviewer → fact-checker → fixer → self-review.
- **The founder always fact-checks**, because the projects are brownfield.

## Scope

**In scope:**
- **New defaults:** `--effort` defaults to `high`, and review-doc's `--fact-check` defaults to `true`.
- **New flag:** `--fix-effort`, default `high`, sets the effort of the fixer and the self-review.
- **Parallel fact-checker:** review-doc's fact-checker runs alongside the reviewer and is merged by a script.

**Out of scope:**
- **A built-in fact-checker for review-code.** That is a follow-up spec.
- **Changing what `--model` defaults to** (see Risks).
- **Session-level levers:** shell aliases, autocompact threshold, session hygiene. These are the founder's config, not the plugin.
- **`tune-tooling/prompts/recommended-prompts.md`.** It lives in another repository; see Follow-ups.

## 1. Flags and defaults (review-doc and review-code)

| Flag | Before | After |
|---|---|---|
| `--effort` | default `max`; sets every agent | default `high`; sets the reviewer and the fact-checker (review-code: the reviewer) |
| `--fix-effort` (new) | — | `high` \| `xhigh` \| `max`, default `high` when absent; sets the fixer and the self-review |
| `--fact-check` (review-doc only) | default `false` | default `true` |
| `--model` | every agent | unchanged: every agent |

**Validation.**
- `--fix-effort` is validated exactly like `--effort`: on an out-of-set value, print `Error: --fix-effort must be one of: high, xhigh, max.` and exit, during argument parsing and before Setup.
- No combination of the two flags is rejected. `--effort high --fix-effort max` is legal.

**Dispatch.**
- The fixer and the self-review are dispatched as `Agent(subagent_type: "ai-dev-tools:<--fix-effort value>-effort", prompt: …)`, with `model: "<--model value>"` added when `--model` was passed.
- The reviewer and review-doc's fact-checker keep `ai-dev-tools:<--effort value>-effort`.
- Each phase's depth directive (`{{EFFORT}}` in review-code's `coder.md`, the effort wording in each fix and self-review dispatch prompt) carries that phase's flag value.
- Both forms keep the `<…>` placeholder, so the `untyped-agent-dispatch` detector (check B) passes unchanged.

**Surfaces to update in both skills:**
- the `argument-hint` front matter
- the argument table
- the `--help` output, including its examples
- the call-form block in Argument Parsing
- review-doc's Review Loop property 5 and its pseudo-code comment
- each dispatch section, and the iteration log, which prints both flags' values

The `--help` example `/review-doc docs/spec.md --fact-check true` ("Rigorous review") is rewritten, because `true` is now the default. review-doc's `When --fact-check false (default)` sentences become `When --fact-check false`.

## 2. The shared dispatch rule (`references/shared-rules/agent-dispatch-pin.md`)

New canonical sentence. It is restated verbatim in both SKILL.md files, which check A2 requires:

> Every dispatched agent is the plugin agent that matches its phase's effort flag, `--effort` for the reviewer and the fact-checker and `--fix-effort` for the fixer and the self-reviewer, and carries `--model` on its Agent call whenever the flag was passed.

**Body changes:**
- **The call:** shows the two forms per flag.
- **When `--effort` is absent:** becomes "When an effort flag is absent". Both default to `high`, and the agent is `ai-dev-tools:high-effort`. `orchestrate` passes neither flag, so its review stages now select `high` for every phase.
- **Which of the two sets the reasoning effort:** names `--fix-effort` as the fixer's and self-review's depth directive.
- **Governed sites:** add `--fix-effort` to the fixer and self-review entries.
- **Measured-on paragraphs:** these record 2026-10-05 runs and stay as history.

**Trap (from the 4.0.0 work):** in any file under `references/shared-rules/`, a line holding a two-digit number, a date included, next to a bare `high`, `medium`, `low` or `critical` fails check A'. Keep dates and effort words on separate lines.

## 3. Parallel fact-checker (review-doc)

### Artifact

The fact-checker stops reading or writing the review JSON. It writes its own file, `tmp/_reviews_errors/[<run_id>-]review-doc-fact-check.json`:

```json
{
  "fact_check_accuracy": 0,
  "fact_check_claims": [{ "claim": "…", "verdict": "ACCURATE" }],
  "issues": [{ "category": "fact-check", "origin": "document", "location": "…", "problem": "…",
               "suggested_fix": "…", "severity": "high", "confidence": 80 }]
}
```

- **Issue fields:** issues carry every field the prompt requires today except `id`. Ids are assigned at merge time.
- **Verdicts:** the verdict vocabulary, the severity rule (`severity-is-consequence`), the confidence ≥ 40 threshold and the accuracy formula are unchanged.

### `skills/review-doc/agents/codebase-fact-checker.md`

- **New output placeholder:** the prompt writes to `{{FACT_CHECK_PATH}}`. The skill substitutes it, and the existing "unsubstituted placeholder → report and stop" rule is restated for it.
- **Step 1 removed:** reading and validating the reviewer artifact, and computing `next_id_seed`.
- **Step 6 removed:** the recount moves to the merge script.
- **Step 7 changed:** it now writes `{{FACT_CHECK_PATH}}`.
- **Abort:** leave `{{FACT_CHECK_PATH}}` unwritten and return a first line beginning `ABORT: `. The sentinel is unchanged, so the `abort-sentinel` detector still passes.

### Merge script: `scripts/merge-fact-check.cjs <review.json> <fact-check.json>`

Node built-ins only, like the other scripts. In order:
1. Validate the fact-check file's shape:
   - `fact_check_accuracy` is an integer from 0 to 100.
   - `fact_check_claims` is an array.
   - Every issue has the required fields and `category: "fact-check"`.
2. Assign each fact-check issue `ISSUE-NNN`, starting at the reviewer's highest numeric suffix plus 1. Zero-pad to at least 3 digits.
3. Append the issues. Copy `fact_check_claims` and `fact_check_accuracy`.
4. Recount `critical_count` and `high_count` over the full array, excluding `origin: "self-review"` (`counts-exclude-self-review`).
5. Write the result to a temp file and run `validate-review-json.cjs --schema doc` on it.
6. Rename the temp file over the review JSON only on exit 0, then print the recount in the validator's format.

**Exit codes:**
- 0: merged.
- 1: the fact-check artifact is missing or invalid, or the merged result fails validation.
- 2: cannot run.

On 1 and 2 the review JSON is byte-identical to the reviewer's.

**Gain:** today nothing checks the fact-checker's recount until the Final Report (Review Loop property 6); with the merge script it is validated as soon as it is written.

### Review loop

```python
for iter in 1..max_iterations:
    if fact_check:
        dispatch review() and fact_check() in ONE message   # they run concurrently
    else:
        review()
    validate(json)                    # the reviewer's output; on failure retry review() alone, once
    pre_fix_criticals = count(json)   # option Y, unchanged: the reviewer's count
    if fact_check and fact_check_returned_ok:
        merge_fact_check(json, fc)    # script; exit 1/2 -> warning, reviewer output stands
    total_criticals = count(json)     # unchanged from here on
    ...                               # fix, self_review, snapshot, exit gate: unchanged
```

**Property changes:**
- **Property 2 is reworded:** "the fact-checker runs alongside the reviewer and is merged before the fixer". The fixer still sees fact-check findings in the same round.
- **Property 3's unresolved-criticals paragraph:** it cites "the fact-checker's recount (step 6)". It now cites the merge script's recount. The number is the same.

### Abort and failure

**Triggers:** any of these is a fact-check failure:
- an `ABORT: ` first line
- a crash or no response
- merge exit 1 or 2

**Handling:**
- Skip the merge.
- Print `Warning: fact-check aborted — <reason>. Falling back to reviewer output.` (unchanged).
- Continue to the fixer.
- **No backup:** the orchestrator no longer backs up the review JSON before the fact-checker, because the fact-checker never touches it. The self-review keeps its backup.
- **Reports:** the terminal and summary print `Fact-check: aborted — <reason>`, as today.
- **Dispatch refusal:** a refused dispatch is still status Error.
- **Reviewer failure:** if the reviewer fails validation twice, the iteration aborts as today. A completed fact-check file is not merged.

**Edits outside the loop:**
- **Setup:** add `./tmp/_reviews_errors/review-doc-fact-check.json` to the deletion list for runs without `--run-id`. The run-id glob already matches it.
- **Output Artifacts:** add a row for the new file, consumed by the merge script.
- **Snapshots:** the file is not snapshotted per round, because the merged review JSON snapshot carries its content.
- **Error Handling table:** the fact-check row loses "restore backup".

### `references/shared-rules/agent-abort-contract.md`

The canonical sentence is unchanged.
- **The body's "three passes append to a review JSON":** becomes two, the two self-review passes.
- **New sentence for the fact-checker:** it writes its own artifact, so its abort means leaving that file unwritten. For it, the orchestrator takes no backup and skips the merge.
- **"Before the fixer — Falling back to reviewer output.":** unchanged.

`counts-exclude-self-review.md` is updated wherever it names the fact-checker as a recount site; that site is now the merge script.

## 4. Restatements outside the two skills

| File | Change |
|---|---|
| `skills/orchestrate/references/auto/stages/stage-i-spec-review.md` (both phases) | "selects its default, the `max` agent" → the `high` agent for every phase. Phase 1 still passes `--fact-check false` explicitly; phase 2 passes `true` and now runs the fact-checker alongside the reviewer |
| `skills/orchestrate/references/auto/stages/stage-iii-code-review.md` | Same default-agent sentence |
| `skills/help/SKILL.md` | "choose among them with `--effort`" → `--effort` (reviewer, fact-checker) and `--fix-effort` (fixer, self-review) |
| `CHANGELOG.md` | 5.0.0 entry (§6) |
| `ai-dev-tools/.claude-plugin/plugin.json` | `version` 4.0.0 → 5.0.0 |

## 5. Verification

**Before each commit, per the repo CLAUDE.md:**
- the six gates, which must all exit clean
- `shared-semantics-mutation-test.sh`, which must stay at 64 passed
  - No gate code changes, so no mutation case is added.
  - If check A2 or C needs adjusting for the two-flag sentence, that is a gate change, and it gets a case that fails first.

**Manifest:** the `plugin.json` change must pass both `claude plugin validate ./ai-dev-tools --strict` and `claude plugin validate . --strict`.

**New test `scripts/merge-fact-check-test.sh`,** in the style of `count-exclusion-test.sh`. It is written first and must fail against a missing script. Fixtures live in `tests/fixtures/fact-check-merge/`, and their hashes are appended to `tests/fixtures/CHECKSUMS.sha256` so `check-fixtures.sh` protects them. Cases:
1. **Renumbering:** fact-check issues are appended after the reviewer's highest id; the reviewer's ids are untouched.
2. **Recount:** includes fact-check criticals and excludes self-review-origin entries.
3. **Invalid artifact:** a missing or invalid fact-check file exits 1, and the review JSON is byte-identical afterwards.
4. **Empty issues:** claims and accuracy are copied, and the counts are unchanged.
5. **Schema:** the merged output passes `validate-review-json.cjs --schema doc`.

**Manual smoke test,** after `/reload-plugins`, from a session at `max` so the pins can be told apart from inheritance:
- **Defaults run:** `/ai-dev-tools:review-doc <small tracked doc> --max-iterations 1` with defaults: fact-check on, high effort.
- **Mixed-effort run:** `--effort max` on the same doc.
- **What to check,** with `tune/tmp/token-usage/2026-10-05/agent-effort-check.py`:
  - The defaults run puts all four agents at high.
  - The `--effort max` run puts the reviewer and fact-checker at max, and the fixer and self-review at high.
  - The reviewer's and fact-checker's run times overlap.

## 6. Release: 5.0.0

The 4.0.0 changelog lists "the same invocation now behaves differently" under Breaking Changes. These do:
- **Breaking:** `--effort` defaults to `high`. A run that passes no `--effort` drops from max to high, `orchestrate`'s review stages included.
- **Breaking:** the fixer and self-review follow `--fix-effort`, default `high`, not `--effort`. A `--effort max` run now fixes at high unless it passes `--fix-effort max`.
- **Breaking:** review-doc's `--fact-check` defaults to `true`.
- **Features:**
  - the `--fix-effort` flag
  - review-doc's reviewer and fact-checker run concurrently
  - `scripts/merge-fact-check.cjs`
- **Tests:** `merge-fact-check-test.sh` and its fixtures.

Expected effect, extrapolated from the measurements rather than measured:
- **A fact-checked review-doc round:** saves the fact-checker's duration, 12–31 min, at no token cost.
- **A `--effort max` round:** the fix agents at high save about $9 and about 30 min.
- **The founder's own runs:** unchanged except for those two, because the founder's prompts already pass `--effort` and `--model`.

## Risks

| Risk | Mitigation |
|---|---|
| A FULL legal or architecture doc gets its fixes at high | `--fix-effort max`. The self-review still checks every fix |
| Reviewer and fact-checker both flag the same wrong claim | Already true today: the fact-checker never deduplicated against the reviewer. The fixer resolves both |
| Colleagues on defaults: review agents run on whatever `CLAUDE_CODE_SUBAGENT_MODEL` names, which is Sonnet on the founder's machine. Sonnet reviewers found 1/5 to 1/3 of Opus's serious findings | Out of scope here. Call it out in the 5.0.0 notes and recommend `--model opus` for review runs |
| Two concurrent agents hit `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | The founder's limit is 3; a review round uses at most 2 at once |

## Follow-ups (not this spec)

1. **review-code built-in fact-checker.** It would verify each Critical/High finding (verdict, correction, fix class) between the reviewer and the fixer, replacing the FULL prompt's hand-dispatched agent and LIGHT's in-session checks.
2. **`recommended-prompts.md` in tune-tooling:**
   - LIGHT doc review's `--effort high` is now the default and can be dropped.
   - FULL doc review should decide whether to add `--fix-effort max`.
   - `--model opus` stays everywhere.
3. **Session-level savings, outside the plugin** and larger than everything above:
   - Launch sessions at `--effort high`: est. 15–25% of total spend.
   - Cap context: est. 5–10%.
   - See the analysis file.
