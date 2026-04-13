# Session Handoff (Standard Mode)

Loaded only when `/orchestrate --handoff` is passed.

---

## Behavior

1. Read `tmp/session-handoff.md`.
   - If not found → error: "No session handoff file found at tmp/session-handoff.md."
2. Parse content using Session Bootstrap logic (see `session-bootstrap.md`).
3. Write hint file with extracted data.
4. Print: "Resumed from session handoff: <feature>, step <N>"
5. Proceed to Fast-Path Detection (which finds the newly written hint file).

## Difference from Session Bootstrap

Session Bootstrap runs automatically on every invocation and only processes recent (≤1 day) handoff files. `--handoff` explicitly requests handoff processing regardless of staleness — no timestamp check is applied.
