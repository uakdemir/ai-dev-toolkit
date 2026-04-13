# Step 3: Respond to Review

**Trigger:** review-doc-summary.md Reviewed matches spec AND Critical>0.

---

## Action

Invoke `/respond-to-review {round} {spec_path}`.

Round = count `## Round N` sections in `tmp/response_analysis.md` matching current spec + 1; default 1.

Loop steps 2-3 until zero criticals.

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
