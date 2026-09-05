# Step 3: Respond to Review

**Trigger:** review-doc-summary.md Reviewed matches spec AND Critical>0.

---

## Action

**No skill is invoked here.** `review-doc` has already applied every critical fix its fixer could
make during the round; the criticals still standing are the ones it could not resolve alone.

Read the brainstorm document whose absolute path `review-doc` printed as the run's last line — see
`references/shared-rules/brainstorm-handoff.md` (plugin-root-relative). It holds exactly what needs a
decision: deferred items, pushed-back items, and remaining criticals the agent declined to fix,
grouped by theme, each with the options and what the agent would do. Present each grouped entry to
the user and wait for their decision — by construction these are the items the agent already judged
it could not settle, so do not resolve one yourself. Apply only the decisions the user gave to the
spec, then run another review round.

Loop steps 2-3 until zero criticals.

**No Confirmation Prompt block here, deliberately.** Steps 2 and 6 carry one because each is about
to invoke a command and the reader confirms it first. Step 3 invokes nothing — the decisions are the
reader's and the next action is theirs — so there is nothing to confirm.

This step previously invoked `/respond-to-review`. That skill is **not shipped by this plugin** —
it resolved only on machines carrying a user-global copy, so standard-mode step 3 failed anywhere
else. It was also the odd one out: step 2 already records "`/respond-to-review` is intentionally NOT
surfaced — review-doc's fix phase applies critical fixes during iterations", and step 6 says the
same for review-code. The round counter it took from `## Round N` sections went with it: nothing in
this plugin writes that shape, and `review-doc`'s own triage writes
`## Review-Doc Response — <date>` instead.

## Breadcrumb

- **Criticals present:**
  ```
  /commit
  /orchestrate (/review-doc <spec_path> --max-iterations 2)
  ```

- **Clean (High>0 only):** Print informational message BEFORE breadcrumb, then:
  ```
  /commit
  /clear → /orchestrate
  ```
  (Phase boundary: Step 3 advancing to Step 4)
