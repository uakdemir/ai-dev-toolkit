# Step 3: Respond to Review

**Trigger:** review-doc-summary.md Reviewed matches spec AND Critical>0.

---

## Action

**No skill is invoked here.** `review-doc` has already applied every critical fix its fixer could
make during the round; the criticals still standing are the ones it could not resolve alone.

Read the brainstorm document whose absolute path `review-doc` printed as the run's last line — see
`references/shared-rules/brainstorm-handoff.md` (plugin-root-relative). It holds exactly what needs a
decision: deferred items, pushed-back items, and remaining criticals the agent declined to fix,
grouped by theme, each with the options and what the agent would do. Decide those, apply the
decisions to the spec, then run another review round.

Loop steps 2-3 until zero criticals.

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
