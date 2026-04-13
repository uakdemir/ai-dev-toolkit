# User Prompt

**Trigger:** No valid cycle state in hint file (missing file, malformed YAML, or empty/missing `feature` field), OR fast-path detection cannot resolve state.

---

```
1. Print: "No previous state found."
   Ask:  "What are you working on and where did you leave off?"

2. Parse response for:
   - Feature name: extract from user response directly.
     If the user names a feature, accept it as-is.
     If ambiguous, ask for clarification (step 4).
   - Step: map natural language to step number:
       "just started" / "haven't done anything yet" → step 1
       "brainstormed" / "wrote spec"                → step 2
       "spec in review" / "waiting on spec review"  → step 3
       "spec reviewed" / "spec approved"            → step 4
       "wrote plan" / "finished planning"           → step 5
       "implementing" / "in the middle of code"     → step 5
       "done implementing"                          → step 6
       "code review in progress" / "reviewing code" → step 7
       "code review done" / "review clean"          → step 7
     For unlisted phrases, treat as ambiguous → step 4.

3. If BOTH resolved:
   → Run one targeted step-specific validation check.
   → If validation contradicts: "That doesn't match what I see — can you clarify?"
   → Continue within 2-3 round limit.
   → Otherwise, write hint file (feature, step, spec, plan if exists, head, updated).

4. If EITHER is ambiguous:
   → Ask a follow-up question. Max 2-3 rounds total.

5. If still unclear after 2-3 rounds:
   → Print: "I can't determine the state automatically.
     Please describe your current step more specifically,
     or check tmp/orchestrate-state.md and update it manually."
   → Write hint with whatever was resolved (feature if known, step 1 as default).
```

**Spec field population:** After accepting the feature name, scan `docs/superpowers/specs/` for files containing the feature name as a case-insensitive substring in the filename (filename matching only — no file content read). If exactly one match, set `spec` to that path. If zero or multiple, set `spec` to `''`.
