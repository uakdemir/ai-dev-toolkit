# Session Bootstrap

Runs on every standard-mode invocation, before Fast-Path Detection.

---

1. Check if `./tmp/session-handoff.md` exists.
2. If not found → skip, proceed to Fast-Path Detection.
3. If found → read YAML frontmatter `generated` timestamp.
   - Compare the `generated` field to the currentDate provided in the system-reminder context. If currentDate is unavailable, run `date +%Y-%m-%d` via Bash. Use only the date portion of generated for comparison. If the date portion differs from currentDate by more than 1 calendar day, treat as stale. Same day or previous day = recent.
   - If stale → print "Stale session handoff (>24h), ignoring." → proceed to Fast-Path Detection.
   - If recent → parse content:
     a. Extract feature name from Done/Pending sections. Look for file paths matching spec filename patterns and scan for spec path patterns (`docs/superpowers/specs/*.md` or `docs/*/specs/*.md`). If multiple candidates, prefer the one appearing in both Done and Pending. If no clear name, set feature to empty and let User Prompt fallback clarify.
     b. Determine step number by scanning Pending items for skill references:
        - Pending mentions spec review or /review-doc → step 2
        - Pending mentions respond to review → step 3
        - Pending mentions write plan or /writing-plans → step 4
        - Pending mentions implement or execution → step 5
        - Pending mentions code review or /review-code → step 6
        - Pending mentions fix findings → step 7
        - No match: scan Done for highest step keyword. Done mentions fix findings → step 7. Done mentions code review → step 6. Done mentions implementation → step 6. Done mentions write plan → step 5. Done mentions respond to review → step 3 or 4. Done mentions spec review → step 3. Done also empty → step 1. Otherwise → step 1.
        If Pending matches multiple, use the lowest-numbered unfinished step. Cross-reference with Done (considered complete).
     c. Extract spec and plan paths from file path references.
     d. Write `tmp/orchestrate-state.md` with extracted data. Set `head` to current `git rev-parse HEAD`.
     e. Print: "Resumed from session handoff: <feature>, step <N>"
4. Proceed to Fast-Path Detection.

**No-op condition:** If the hint file already has valid cycle state (non-empty `feature` field), Session Bootstrap is a no-op — Fast-Path Detection handles it.
