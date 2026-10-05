# ai-dev-toolkit

Source repo for the `ai-dev-tools` Claude Code plugin. The plugin is installed via a local
`directory` marketplace pointing at `ai-dev-tools/`, so **this working tree _is_ the plugin** —
edits go live after `/reload-plugins`. No `git push` is required for local use.

That holds for every profile on this machine, whatever version its `plugins/installed_plugins.json`
shows: that field is the record written at install time and goes stale. What a session loads is
`readFromFolder` in `claude plugin list --json`. So an edit here is live for every profile's next
session, finished or not — land a change to a skill's dispatch as one commit.

## Gate — manifest changes must pass strict validation

Any change to `ai-dev-tools/.claude-plugin/plugin.json`, `ai-dev-tools/.claude-plugin/marketplace.json`
or the root `.claude-plugin/marketplace.json` MUST pass **both** of these before being committed:

```bash
claude plugin validate ./ai-dev-tools --strict   # the local directory marketplace — how this tree is installed
claude plugin validate . --strict                # the root marketplace — how colleagues install from GitHub
```

There are two marketplace manifests and they are deliberately different: the root one is named
`ai-dev-toolkit` and points at `./ai-dev-tools`, the nested one is named `ai-dev-tools` and points at
`./`. Only the nested one was gated, which is backwards — the root manifest is the one a colleague's
`claude plugin marketplace add uakdemir/ai-dev-toolkit` reads, so a break there fails for everyone
except the person able to notice it.

**A JSON parse check is not sufficient.** In the 2.6.0 refresh, `repository` was written in the
object form `{"type":"git","url":"…"}` — perfectly valid JSON, and rejected by the plugin loader:

```
plugins[0] plugin.json → repository: Invalid input: expected string, received object
```

That single field failed the **entire plugin load** (17 → 16 plugins, all 15 skills unavailable),
and the only user-visible symptom was a generic `1 error during load` plus `Unknown command`.
The validator names the offending field in one line; nothing else in the pipeline does.

## Gate — run these before committing

All static, all sub-second, all exit 0 on a clean tree. Run the first two on any change to a review
skill or a shared rule; run the whole set before anything that touches `scripts/` or `tests/`.

```bash
node ./ai-dev-tools/scripts/check-shared-semantics.cjs ./ai-dev-tools   # exit 0
./ai-dev-tools/scripts/count-exclusion-test.sh ./ai-dev-tools           # 5 passed
node ./ai-dev-tools/scripts/check-doc-links.cjs ./ai-dev-tools          # exit 0
node ./ai-dev-tools/scripts/check-schema-drift.cjs ./ai-dev-tools       # exit 0
./ai-dev-tools/scripts/check-detector-coverage.sh ./ai-dev-tools        # PASS
./ai-dev-tools/scripts/check-fixtures.sh ./ai-dev-tools                 # PASS
```

| gate | what it stops |
|---|---|
| `check-shared-semantics.cjs` | a rule governing two skills forking in one of them |
| `count-exclusion-test.sh` | `critical_count` counting the review loop's own churn, and an artifact still carrying the removed `phase` key |
| `check-doc-links.cjs` | a doc citing a plugin file by a *path* stated relative to the wrong root — found 6 real ones the day it was written (a bare basename that resolves nowhere is reported as a warning, not a failure) |
| `check-schema-drift.cjs` | a SKILL.md publishing a schema its validator does not enforce |
| `check-detector-coverage.sh` | the severity detector silently gaining or losing a file |
| `check-fixtures.sh` | a review round editing the read-only eval oracle |

And one reporter, which never fails a build:

```bash
node ./ai-dev-tools/scripts/report-duplication.cjs ./ai-dev-tools
```

It lists prose duplicated across skills as candidates for `references/shared-rules/`. It reports
rather than gates on purpose: its strongest signal is near-duplication, and near-duplication cannot
be told from a deliberate difference mechanically. The pairs it actually ranks highest in this corpus
are the `## Tool Usage Rules` block shared by three prompts — duplicated boilerplate a maintainer
might reasonably promote. A pair it does *not* surface at all — `review-code` "apply or push back"
versus `review-doc` "apply, defer, or push back" — reads exactly like a fork and is a documented,
intentional divergence. A human settles either in ten seconds; a similarity threshold never will.
The loop is: report → decide → promote to a shared rule → and write a detector if the rule has a
mechanical signature, because check D only runs for detector-bearing rules.

`check-shared-semantics.cjs` enforces that each shared rule is single-sourced, stated (not merely cited) by every skill it governs, and unviolated. Check D — no skill
outside a rule's `applies-to` quietly does the governed thing — runs only for a rule that declares a
`detector`. Only `severity-is-consequence`, `agent-abort-contract` and `brainstorm-handoff` do; for
every other registry rule, checks A2 and C are the whole binding — they prove the
canonical sentence is *stated*, never that it is obeyed or even satisfiable.

**These are manual gates — nothing invokes them automatically.** Severity-is-consequence forked
because `6f22c6a` fixed it in `review-code` and verification was scoped to the files that fix
touched; the gate exists so the next such divergence fails loudly, but only if it is run.

If you change a gate, re-run its mutation suite and add a case for what you changed:

```bash
./ai-dev-tools/scripts/shared-semantics-mutation-test.sh ./ai-dev-tools  # 51 passed
```

A gate tested only against the bug it was written from proves the author can grep. That suite now
pins nine defects in the gate itself, each of which survived a careful read of the gate's source —
most recently a last-line pattern that matched `as the run's last line` but not `as the run last
line`, so one missing apostrophe made the claim invisible.
