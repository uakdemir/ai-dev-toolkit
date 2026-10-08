# Review skills: cheaper defaults, a fix-effort flag, and a parallel fact-checker

**Date:** 2026-10-08 · **Target release:** ai-dev-tools 5.0.0 · **Skills:** review-doc, review-code (plus restatements in orchestrate, help, the agent definitions and two shared rules)

## Why

These numbers come from usage measured across the founder's two working profiles (1,047 sessions, 2026-07-25 to 2026-10-08). The analysis was written to a session scratchpad, as `usage-analysis-2026-10-08.md`, and does not outlive that session, so every figure this spec relies on is copied here.

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
  - The fact-checker's median is $6.41 / 15.7 min at high and $12.52 / 31.4 min at max. At high that rests on two runs.
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
- the default sentence in Argument Parsing, "When `--effort` is not passed, default to `max`.": it says `high`, and gains a `--fix-effort` twin
- review-doc's Review Loop property 5 and its pseudo-code comment
- review-code's Iteration Flow pseudo-code: the fixer's "(the --effort agent; …)" and the self-review's "same agent type and model"
- review-code's intro, "A single agent (pinned at the `--effort` reasoning level, …) handles both review and fix phases", and the Iteration Flow sentence "all rounds use the same single agent"
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

- **New output placeholder:** the prompt writes to `{{FACT_CHECK_PATH}}`, which replaces `{{OUTPUT_PATH}}` in the Output Format line ("write structured JSON directly to …") as well as in step 7. The skill substitutes it, and the existing "unsubstituted placeholder → report and stop" rule is restated for it.
- **Step 1 removed:** reading and validating the reviewer artifact, and computing `next_id_seed`.
- **Step 3 changed:** its `"id"` bullet goes, and with it "Never reuse or renumber existing IDs from the reviewer's output". Issues go into the fact-checker's own `issues` array, and `scripts/merge-fact-check.cjs` assigns their ids.
- **Step 6 removed:** the recount moves to the merge script.
- **Step 7 changed:** it now writes `{{FACT_CHECK_PATH}}`.
- **Abort:** leave `{{FACT_CHECK_PATH}}` unwritten and return a first line beginning `ABORT: `. The sentinel is unchanged, so the `abort-sentinel` detector still passes. The triggers step 1 named, all about the reviewer's JSON, go with it, so the prompt names the ones that remain: a listed document cannot be read, or `{{FACT_CHECK_PATH}}` cannot be written.

### Merge script: `scripts/merge-fact-check.cjs <review.json> <fact-check.json>`

Node built-ins only, like the other scripts. In order:
1. Validate the fact-check file's shape:
   - `fact_check_accuracy` is an integer from 0 to 100.
   - `fact_check_claims` is an array.
   - Every issue has the required fields and `category: "fact-check"`.
   - No issue carries an `id`. One that does is rejected, never overwritten.
   - An issue's `origin`, when present, is `"document"`. Any other value is rejected: a `"self-review"` issue would pass the validator and drop out of the counts.
2. Assign each fact-check issue `ISSUE-NNN`, starting at the reviewer's highest numeric suffix plus 1, or at 1 when the reviewer's `issues` array is empty. Zero-pad to at least 3 digits.
3. Append the issues. Copy `fact_check_claims` and `fact_check_accuracy`.
4. Recount `critical_count` and `high_count` over the full array, excluding `origin: "self-review"` (`counts-exclude-self-review`).
5. Write the result to a temp file in the review JSON's directory, so the rename stays on one filesystem, and run `validate-review-json.cjs --schema doc` on it.
6. Rename the temp file over the review JSON only on exit 0, then print the recount in the validator's format.

**Exit codes:**
- 0: merged.
- 1: the fact-check artifact is missing or invalid, or the merged result fails validation.
- 2: cannot run.

On 1 and 2 the review JSON is byte-identical to the reviewer's, and the temp file, if one was written, is deleted. The loop treats any result other than 0 as a fact-check failure, the shell's `127` when `node` is absent included: the script never ran, so nothing was merged (see Abort and failure).

**Gain:** today nothing checks the fact-checker's recount until the Final Report (Review Loop property 6); with the merge script it is validated as soon as it is written.

### Review loop

```python
for iter in 1..max_iterations:
    if fact_check:
        delete(fc)                    # so the merge can only ever read this round's file
        dispatch review() and fact_check() in ONE message   # they run concurrently
    else:
        review()
    validate(json)                    # the reviewer's output; on failure retry review() alone, once
    pre_fix_criticals = count(json)   # option Y, unchanged: the reviewer's count
    if fact_check and fact_check_returned_ok:
        merge_fact_check(json, fc)    # script; any exit but 0 -> warning, reviewer output stands
    total_criticals = count(json)     # unchanged from here on
    ...                               # fix, self_review, exit gate: unchanged; snapshot: see Snapshots
```

**Property changes:**
- **Property 2 is reworded:** "the fact-checker runs alongside the reviewer and is merged before the fixer". The fixer still sees fact-check findings in the same round.
- **Property 3's unresolved-criticals paragraph:** it cites "the fact-checker's recount (step 6)". It now cites the merge script's recount. The number is the same.
- **Property 6:** its account of the fact-checker's recount, from "the fact-checker recomputes `critical_count`" to "the only check on the fact-checker's recount", names the merge script instead, which validates the merged artifact before writing it. The Final Report stays the only check on the self-review pass's appends.

### Abort and failure

**Triggers:** any of these is a fact-check failure:
- an `ABORT: ` first line
- a crash or no response
- any merge result other than exit 0, including `127` when `node` is absent

**Handling:**
- The review JSON stays the reviewer's: the merge is skipped, or it failed and left the file byte-identical.
- Print `Warning: fact-check aborted — <reason>. Falling back to reviewer output.` (unchanged). For a failed merge, `<reason>` gives its exit code and cause, e.g. `merge exited 127: node unavailable`.
- Continue to the fixer.
- **Status Logic:** whichever trigger fired, the pass counts as not completed, so rules 2 and 3 do not read `fact_check_accuracy`, which still holds the reviewer's default. On a machine without `node` that is every fact-checked round.
- **No backup:** the orchestrator no longer backs up the review JSON before the fact-checker, because the fact-checker never touches it. The self-review keeps its backup.
- **Reports:** the terminal and summary print `Fact-check: aborted — <reason>`, as today.
- **Dispatch refusal:** a refused dispatch is still status Error.
- **Reviewer failure:** if the reviewer fails validation twice, the iteration aborts as today. A completed fact-check file is not merged.

**Edits outside the loop:**
- **Setup:** add `./tmp/_reviews_errors/review-doc-fact-check.json` and `./tmp/_reviews_errors/review-doc-fact-check-iteration-*.json` to the deletion list for runs without `--run-id`. The run-id glob already matches both. Setup's note on a `.bak` "left by a prior run's fact-check or self-review phase" names the self-review phase only. Its paragraph on "the two per-round snapshot globs" counts three, and its "already matches both" becomes all three.
- **Each round:** before the round's dispatch, the orchestrator deletes `[<run_id>-]review-doc-fact-check.json`, the loop's `delete(fc)`. That is what makes the merge's "missing → exit 1" hold in every round and not only the first. Without it, a later round's fact-checker that returned without writing its file would leave the previous round's file to be merged, at locations that round's fixer already changed.
- **Output Artifacts:** add rows for the new file, consumed by the merge script, and for its failure snapshot.
- **Snapshots:** the file is not snapshotted when its merge succeeds, because the merged review JSON snapshot carries its content. In a round whose fact-check failed, the snapshot step also copies the file, if one exists, to `[<run_id>-]review-doc-fact-check-iteration-N.json`, so the evidence survives the next round's deletion.
- **Error Handling table:** the fact-check row loses "restore backup", and its triggers gain a merge result other than exit 0.

**Fact-Checker dispatch section,** rewritten to say that the fact-checker:
- is dispatched in the same message as the reviewer;
- takes no backup;
- receives `{{FACT_CHECK_PATH}}` → the resolved `tmp/_reviews_errors/[<run_id>-]review-doc-fact-check.json` by substitution, in place of `{{OUTPUT_PATH}}`;
- writes its own artifact, which `scripts/merge-fact-check.cjs` renumbers, appends and recounts.

Its heading's "(when `--fact-check true`)" becomes "(unless `--fact-check false`)". What goes: "Runs **after the reviewer, before the fixer**", the backup paragraph, the abort paragraph ("restores the backup"), and the six-step list from "Reads `tmp/_reviews_errors/review-doc.json`" to "Rewrites the JSON file".

**Every other passage that describes the old fact-checker** is rewritten, so none is left stale:
- `skills/review-doc/SKILL.md`:
  - the intro, "When `--fact-check true` is passed, a sequential fact-checker …", and the `--help` prose, "Fact-checker runs when --fact-check true is passed.": the fact-checker runs alongside the reviewer unless `--fact-check false` is passed;
  - Agent Dispatch's substitution rule, which names `{{OUTPUT_PATH}}` and `{{FIX_REPORT_PATH}}`: it names `{{FACT_CHECK_PATH}}` too;
  - Final Report step 0, "the only point at which the fact-checker's recount and the self-review pass's appends are checked": the merge script now checks the recount, so this is the only check on the self-review pass's appends;
  - Self-Review: "exactly as it does for the fact-checker" goes from the backup sentence, and "Identical to the fact-checker's" from the abort paragraph, since the fact-checker now leaves its own file unwritten; "minting ids from `max + 1` exactly as the fact-checker does" becomes "as the merge script does for the fact-check findings";
  - Terminal Output: "When `--fact-check true` was passed but the pass aborted" becomes "When the fact-check failed", covering every trigger, and "the reviewer's default, restored from the backup" becomes the reviewer's default, which a failed fact-check leaves in place;
  - Cross-Iteration Tracking, "IDs are per-round": the merge script, not the fact-checker, continues from `max + 1`;
  - Status Logic: rule 1's "that contract restores the backup" allows for the fact-checker, which has none, and "an abort restores exactly that artifact" becomes "a failed fact-check leaves exactly that artifact".
- `skills/review-doc/prompts/reviewer.md`, Output Processing step 5: "The fact-checker and the self-review pass continue your numbering from `max + 1`" names the merge script in place of the fact-checker.
- `skills/review-doc/prompts/coder.md`, Procedure step 3: "the fact-checker appends from `max + 1`" becomes "the merge script appends the fact-checker's findings from `max + 1`".

### `references/shared-rules/agent-abort-contract.md`

The canonical sentence is unchanged.
- **The body's "three passes append to a review JSON":** becomes two, the two self-review passes.
- **New sentence for the fact-checker:** it writes its own artifact, so its abort means leaving that file unwritten. For it, the orchestrator takes no backup and skips the merge.
- **"## The contract" and "What each governed skill must carry":** the backup before dispatch, the restore on detection, and the backup step and `.bak` paths in the must-carry list are limited to passes that append to a review JSON another pass wrote, which are the two self-review passes. As written they bind every governed pass, and the fact-checker would break them.
- **"Before the fixer — Falling back to reviewer output.":** only the tail is unchanged. The clause after it becomes "Used by `review-doc`'s fact-checker, which runs alongside the reviewer and is merged before the fixer".

## 4. Restatements outside the two skills

| File | Change |
|---|---|
| `skills/orchestrate/references/auto/stages/stage-i-spec-review.md` (both phases) | "selects its default, the `max` agent" → the `high` agent for every phase. Phase 1 still passes `--fact-check false` explicitly; phase 2 passes `true` and now runs the fact-checker alongside the reviewer |
| `skills/orchestrate/references/auto/stages/stage-iii-code-review.md` | Same default-agent sentence |
| `skills/orchestrate/references/auto/failure-handling/unresolved-criticals.md` | Measurement: "after the fact-checker's recount" and "plus the fact-checker's recount" → the recount by `scripts/merge-fact-check.cjs`, still made before the fixer |
| `skills/orchestrate/references/common/error-logs-format.md` | Gate Read Contract: "the fact-checker's recount after appending its findings" → the recount by `scripts/merge-fact-check.cjs` after it appends the fact-check findings, still made before the fixer |
| `skills/help/SKILL.md` | "choose among them with `--effort`" → `--effort` (reviewer, fact-checker) and `--fix-effort` (fixer, self-review) |
| `agents/high-effort.md`, `agents/xhigh-effort.md`, `agents/max-effort.md` | Each description's "dispatch it for `--effort <level>`" → "dispatch it for `--effort <level>` or `--fix-effort <level>`" |
| root `CLAUDE.md` | Gate block: add `./ai-dev-tools/scripts/merge-fact-check-test.sh ./ai-dev-tools  # 7 passed`. Its "what it stops" table gains `merge-fact-check-test.sh`: a fact-check merge that renumbers, recounts or writes wrongly |
| `CHANGELOG.md` | 5.0.0 entry (§6) |
| `ai-dev-tools/.claude-plugin/plugin.json` | `version` 4.0.0 → 5.0.0 |

## 5. Verification

**Before each commit, per the repo CLAUDE.md:**
- the seven gates, which must all exit clean: the six in the repo CLAUDE.md, and `merge-fact-check-test.sh`, which §4 adds to its gate block
- `shared-semantics-mutation-test.sh`, which must stay at 64 passed
  - No gate code changes, so no mutation case is added.
  - If check A2 or C needs adjusting for the two-flag sentence, that is a gate change, and it gets a case that fails first.

**Landing.** This working tree is the installed plugin, and an edit is live for every profile's next session, finished or not (repo CLAUDE.md). So:
- The merge script, its test, its fixtures and the CLAUDE.md gate entry may land first, because nothing calls them yet.
- Everything that changes dispatch or the fact-check flow lands in one commit, and the gates run on that commit: `agent-dispatch-pin.md`, `agent-abort-contract.md`, both SKILL.md files and their prompts, `codebase-fact-checker.md`, the `agents/*.md` descriptions, and the orchestrate and help restatements. Check A2 needs the canonical sentence changed in the rule and in both SKILL.md files at once, and the fact-checker prompt's switch to `{{FACT_CHECK_PATH}}` breaks fact-checking in other sessions until SKILL.md substitutes it and calls the merge.

**Manifest:** the `plugin.json` change must pass both `claude plugin validate ./ai-dev-tools --strict` and `claude plugin validate . --strict`.

**New test `scripts/merge-fact-check-test.sh`,** in the style of `count-exclusion-test.sh`. It is written first and must fail against a missing script. Fixtures live in `tests/fixtures/fact-check-merge/`, and their hashes are appended to `tests/fixtures/CHECKSUMS.sha256` so `check-fixtures.sh` protects them. Each case copies its fixtures into a `mktemp -d` directory and merges there, never on a fixture's own path: the merge renames its output over its first argument, and a rewritten fixture fails `check-fixtures.sh`. A case that expects a merge compares the result with an expected-output fixture. Each case prints one PASS line, so a clean run reports 7 passed. Cases:
1. **Renumbering:** fact-check issues are appended after the reviewer's highest id; the reviewer's ids are untouched.
2. **Recount:** includes fact-check criticals and excludes self-review-origin entries.
3. **Invalid artifact:** a missing or invalid fact-check file exits 1, and the review JSON is byte-identical afterwards. Invalid includes an issue that carries an `id` and one whose `origin` is not `"document"`.
4. **Empty issues:** claims and accuracy are copied, and the counts are unchanged.
5. **Schema:** the merged output passes `validate-review-json.cjs --schema doc`.
6. **Empty reviewer array:** the fact-check ids start at `ISSUE-001`.
7. **Rejected after merging:** a fact-check issue with `confidence` 30 passes step 1 and fails step 5. The merge exits 1, the review JSON is byte-identical, and no temp file is left in its directory.

**Manual smoke test,** run by the founder after `/reload-plugins`, from a session at `medium`. No run below pins `medium`, so every pinned agent differs from the session and a pin cannot be mistaken for inheritance. Every run passes `--model opus`, on which both levels the runs pin, `high` and `max`, held when measured on 2026-10-05; another model may step a level down (`agent-dispatch-pin.md`).
- **Where:** on a scratch branch the founder creates, because both skills commit: review-doc's triage, and review-code's fixer, self-review and triage. On it the founder first commits three copies of a small doc under distinct names, each with one planted wrong file path, then a throwaway commit that plants one obvious bug. The fixer and the self-review run only in a round that found an issue, so the plants make every round dispatch them; a round that finds nothing is re-run on a plainer plant. Afterwards the founder discards the working-tree edits the review-doc runs leave uncommitted, since its fixer and self-review never commit and its triage commits only when it applies a fix, and then deletes the branch, which discards the planted commits and every commit the runs made.
- **Runs,** in this order, so the review-code run sees the throwaway commit as the last one and a clean tree:
  1. `/ai-dev-tools:review-code 1 --max-iterations 1 --effort high --fix-effort max --model opus`
  2. `/ai-dev-tools:review-doc <copy 1> --max-iterations 1 --model opus`: defaults, so fact-check on and every agent at high
  3. `/ai-dev-tools:review-doc <copy 2> --max-iterations 1 --effort max --model opus`
  4. `/ai-dev-tools:review-doc <copy 3> --max-iterations 1 --effort high --fix-effort max --model opus`
- **How to check:** read each subagent's transcript under the running profile's `projects/` directory, `<profile>/projects/<project>/<session>/subagents/agent-*.jsonl`, with the `.meta.json` beside it, which names the agent's type and description. Take the `effort` and `model` fields of its assistant records, and the timestamps of its first and last records.
- **What to check:**
  - Run 1 puts the reviewer at high, and the fixer and self-review at max.
  - Run 2 puts all four agents at high.
  - Run 3 puts the reviewer and fact-checker at max, and the fixer and self-review at high.
  - Run 4 puts the reviewer and fact-checker at high, and the fixer and self-review at max.
  - Every agent runs on Opus.
  - In runs 2 to 4 the reviewer and the fact-checker overlap: each one's first record comes before the other's last. Dispatched in sequence, the fact-checker's first record would come after the reviewer's last.

## 6. Release: 5.0.0

The 4.0.0 changelog lists "the same invocation now behaves differently" under Breaking Changes. These do:
- **Breaking:** `--effort` defaults to `high`. A run that passes no `--effort` drops from max to high, `orchestrate`'s review stages included.
- **Breaking:** the fixer and self-review follow `--fix-effort`, default `high`, not `--effort`. A `--effort max` run now fixes at high unless it passes `--fix-effort max`.
- **Breaking:** review-doc's `--fact-check` defaults to `true`. A run that passes no `--fact-check` now runs the fact-checker every round, and its self-review checks the fixer's text against the codebase too. That includes `orchestrate` standard mode's spec and plan reviews, which pass none (`skills/orchestrate/references/standard/steps/step-1.md` to `step-4.md`).
- **Note,** beside the Breaking Changes: with no `--model`, review agents run on `CLAUDE_CODE_SUBAGENT_MODEL` when it is exported (Sonnet on some machines), and on the session's model otherwise. Pass `--model opus` for review runs.
- **Features:**
  - the `--fix-effort` flag
  - review-doc's reviewer and fact-checker run concurrently
  - `scripts/merge-fact-check.cjs`
- **Tests:** `merge-fact-check-test.sh` and its fixtures.

Expected effect, extrapolated from the measurements rather than measured:
- **A fact-checked review-doc round:** saves the shorter of the reviewer's and fact-checker's durations, about 12–31 min (the reviewer's medians at high and max), at no token cost.
- **A `--effort max` round:** the fix agents at high save about $9 and about 30 min.
- **The founder's own runs:** unchanged except for those two, because the founder's prompts already pass `--effort` and `--model`.
- **A run that passes no `--fact-check`,** `orchestrate` standard mode's reviews included: each round gains a fact-checker, a median $6.41 at high or $12.52 at max, and the self-review's check of the fixer's text against the codebase. Running alongside the reviewer, the fact-checker adds little wall-clock.

**Measured after release.** After about ten real rounds of each skill on 5.0.0, the founder measures these figures from those runs' transcripts and compares each with its baseline:
- the median review-doc and review-code rounds, against 50 and 42 min;
- the fixer's median cost, against $11.72 at max;
- the self-review's Critical+High findings per fixed issue, against the same ratio in rounds fixed at max before 5.0.0, which the Why does not carry, so the founder measures it from their transcripts. The self-review drops to high with the fixer, and a high reviewer finds about half the Critical+High findings of a max one (Why), so fixes as good as before would show about half the old ratio. If it comes out above that, fixes at high are worse, and the `--fix-effort` default reverts to following `--effort`.

## Risks

| Risk | Mitigation |
|---|---|
| A FULL legal or architecture doc gets its fixes at high | `--fix-effort max`. The self-review still checks every fix |
| Reviewer and fact-checker both flag the same wrong claim | Already true today: the fact-checker never deduplicated against the reviewer. The fixer resolves both |
| Colleagues on defaults: review agents run on `CLAUDE_CODE_SUBAGENT_MODEL` when it is exported (Sonnet on the founder's machine), and on the session's model otherwise. Sonnet reviewers found 1/5 to 1/3 of Opus's serious findings | Out of scope here. Call it out in the 5.0.0 notes and recommend `--model opus` for review runs |
| Two concurrent agents hit `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | The founder's limit is 3; a review round uses at most 2 at once |

## Follow-ups (not this spec)

1. **review-code built-in fact-checker.** It would verify each Critical/High finding (verdict, correction, fix class) between the reviewer and the fixer, replacing the FULL prompt's hand-dispatched agent and LIGHT's in-session checks.
2. **`recommended-prompts.md` in tune-tooling:**
   - LIGHT doc review's `--effort high` is now the default and can be dropped.
   - FULL doc review should decide whether to add `--fix-effort max`.
   - `--model opus` stays everywhere.
3. **Session-level savings, outside the plugin** and larger than everything above:
   - Launch sessions at `--effort high`: est. 15–25% of total spend.
   - Cap context, with a fresh session per phase and no `/resume` of a large session after a break: est. 5–10%.
