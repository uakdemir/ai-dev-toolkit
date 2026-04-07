# Item 03: orchestrate — `--strict` propagation in breadcrumbs + breadcrumb-as-last-line

**Date:** 2026-04-07
**Status:** Draft
**Depends on:** Item 02 (Step 5 must already be a delegating wrapper before this lands)

## Problem

Two distinct issues compound each other.

### Problem 1: `--strict` is invisible in breadcrumbs

When the user invokes orchestrate in strict mode (`/orchestrate --strict`), strict mode is recorded in the hint file at `mode: strict`. But the breadcrumbs printed at step boundaries omit the `--strict` flag entirely:

```
Next: /orchestrate (/review-doc <spec>)
```

If the user copy-pastes this breadcrumb verbatim, the next invocation **silently downgrades to non-strict mode**. The user has no signal that this happened.

### Problem 2: Breadcrumb is not always the literal last line

Several exit paths in `orchestrate/SKILL.md` print a breadcrumb followed by trailing prose, e.g.:

```
Next: /orchestrate (/review-doc <spec>)

The review will run with sonnet for early rounds. If criticals reach zero,
the final gate (opus + fact-checker) will trigger automatically.
```

This makes the breadcrumb harder to grab as the literal final line — both for human copy-paste and for any future tooling that wants to extract the next-command. The convention should be: **breadcrumb is always the final line of the response, no exceptions**.

## Scope

**In scope:**
- Strict-mode flag echoing in all three breadcrumb forms (bare, wrapped, phase-boundary)
- Audit and fix every breadcrumb exit point so the breadcrumb is the literal last line
- Add "When NOT to emit a breadcrumb" subsection (mid-conversation prompts that aren't exits)
- RED auto-handoff path: keep prose, append breadcrumb at the end, call `/session-handoff --light`
- Error Handling table: add a Breadcrumb column

**Out of scope:** (all moved to Item 04)
- Multi-line breadcrumbs with labeled options
- Auto-commit verification before transitions
- Quality-gate suggestions at success points

## Files Modified

| File | Change |
|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Add strict-mode echoing subsection; fix all breadcrumb exit points; add NOT-to-emit subsection; update RED handoff; add Breadcrumb column to Error Handling table |

No other files touched. (`/session-handoff` will need a `--light` flag for RED handoffs to call — that's out of scope for this item but is a known follow-up.)

## Concrete Changes

### Change 1 — Strict-mode flag echoing subsection

Add a new subsection to `orchestrate/SKILL.md` titled **"Strict Mode Breadcrumbs"** with this table:

| Form | Standard mode | Strict mode |
|---|---|---|
| Bare | `/orchestrate` | `/orchestrate --strict` |
| Wrapped | `/orchestrate (/inner-command args)` | `/orchestrate --strict (/inner-command args)` |
| Phase boundary | `/clear → /orchestrate (/inner-command args)` | `/clear → /orchestrate --strict (/inner-command args)` |

**Rule:** Before emitting any breadcrumb, read `mode:` from the hint file. If `mode: strict`, insert `--strict` immediately after `/orchestrate` and before the wrapped inner command (or before nothing, for bare form).

### Change 2 — Breadcrumb position guarantee

Audit every exit point in `orchestrate/SKILL.md` and confirm the breadcrumb is the **literal last lines** of the printed output. (Plural — "last lines", not "last line" — because Item 04 layers multi-line option blocks on top of several of these rows. The position guarantee carries over: even when a breadcrumb is a multi-line labeled-options block, the entire block must be the absolute final block of the response with nothing after it.) Wrap the audit list directly into the spec for traceability.

**Note for Item 04 implementer:** Several rows in the audit table below (Step 2, Step 4, Step 5 post-implement, Step 6, Step 7) will be rewritten by Item 04 as multi-line option blocks. The "Today" column reflects the single-line state; the "After" column reflects single-line under Item 03. Item 04 then transforms several of those single-line "After" rows into multi-line blocks. The position guarantee from this item still applies — multi-line blocks must be the absolute last block, no trailing prose.

**Audit list — exit points that emit a breadcrumb:**

| # | Location | Today | After |
|---|---|---|---|
| 1 | Step 0 GREEN exit | Breadcrumb mid-output | Breadcrumb is last line |
| 2 | Step 0 YELLOW exit | Breadcrumb mid-output | Breadcrumb is last line |
| 3 | Step 0 RED auto-handoff exit | Prose only, no breadcrumb | Prose + breadcrumb appended (see Change 4) |
| 4 | Step 1 brainstorm complete | Breadcrumb followed by encouragement prose | Breadcrumb is last line |
| 5 | Step 2 review complete | Breadcrumb mid-output | Breadcrumb is last line |
| 6 | Step 3 respond-to-review complete | Breadcrumb mid-output | Breadcrumb is last line |
| 7 | Step 4 write-plan complete | Breadcrumb mid-output | Breadcrumb is last line |
| 8 | Step 5 delegating wrapper exit (post Item 02) | New exit point | Breadcrumb is last line |
| 9 | Step 6 code-review complete | Breadcrumb followed by next-step prose | Breadcrumb is last line |
| 10 | Step 7 Fix Findings exit | Wrapped `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` (re-runs code review after fixes applied) | Breadcrumb is last line |
| 11 | Step 8 Complete/finalize | Breadcrumb followed by celebration prose | Breadcrumb is last line |
| 12 | Step 8 brainstorm-next exit | Plain `/orchestrate` followed by prose | Wrapped `/orchestrate (/brainstorming)` is last line (per Item 04 — Item 03 just removes the trailing prose) |
| 13 | Fast-path detection success exit | Breadcrumb mid-output | Breadcrumb is last line |
| 14 | User Prompt fallback exit | Breadcrumb mid-output | Breadcrumb is last line |
| 15 | Error Handling exits (each row) | Some have breadcrumbs, some don't | Per Change 5: every error row has a Breadcrumb column |
| 16 | Step 0 Context Health Check YELLOW (warn-and-continue) | Breadcrumb mid-output | Breadcrumb is last line |

All 16 sites must end with the breadcrumb as the literal final line.

### Change 3 — "When NOT to emit a breadcrumb" subsection

Add a new subsection clarifying that breadcrumbs are for **step-boundary exits only**, not for mid-conversation prompts:

> **When NOT to emit a breadcrumb:**
>
> - Mid-conversation clarifying questions ("Which plan should I implement?" "Confirm spec path?") — these are not exits, they're inline prompts. Do not append a breadcrumb.
> - Tool-output displays ("Here's the task graph:" "Here's the diff preview:") — these are informational, not transitions.
> - Validation failures that loop back ("Plan parse failed, retrying with relaxed mode") — internal retry, not a step boundary.
> - Any output that the user is expected to respond to before the skill continues.
>
> Breadcrumbs are emitted **only at the moment the skill is exiting and handing control back to the user**, signaling "here is what to run next."

### Change 4 — RED auto-handoff path

Today's RED auto-handoff (line 117) prints prose explaining that context is full and the user should run `/session-handoff` manually. Update it to:

1. **Keep the prose** (it's human-readable and explains why the handoff is happening)
2. **Call `/session-handoff --light`** instead of plain `/session-handoff` — the `--light` flag (a known follow-up to the session-handoff skill) emits a minimal handoff doc that won't itself trigger autocompact
3. **Append a breadcrumb box** at the end with the literal next-command:

```
RED zone detected (>80% context). Saving a light session handoff before
auto-compact triggers...

[/session-handoff --light is now running]

After the handoff doc is written, resume in a fresh session with:

  /orchestrate --strict   ← (strict form if mode: strict, else /orchestrate)
```

The `--light` flag itself is **out of scope** for Item 03 (it lives in `/session-handoff`). This spec only specifies that orchestrate calls it with that flag. The session-handoff change is a separate follow-up.

**Fallback behavior (while `--light` is not yet implemented):** If `/session-handoff --light` returns an error or unrecognized-flag response, orchestrate falls back to calling plain `/session-handoff` instead. The breadcrumb and prose output are identical either way — only the handoff doc size differs. Implementors: add a try/fallback wrapper around the `--light` call so the RED path is never broken by a missing flag.

### Change 5 — Error Handling table: add Breadcrumb column

Update the Error Handling table at lines 411-425 to include a third column showing the breadcrumb that should be emitted on each error path:

| Error | Action | Breadcrumb (last line of output) |
|---|---|---|
| Hint file missing/corrupt | Recreate from current step inference | `/orchestrate --strict` (or appropriate mode) |
| Plan file missing | Print path and ask user to confirm | (no breadcrumb — inline prompt) |
| Subagent dispatch failed | Print error, fall back to single-agent | `/orchestrate --strict (/implement <plan>)` |
| review-doc returned no output | Print error and exit | `/orchestrate --strict (/review-doc <spec>)` (retry) |
| /clear refused (mid-conversation tool block) | Print error and exit | `/clear → /orchestrate --strict (/implement <plan>)` |
| ... | ... | ... |

(Full table to be filled in during implementation by reading the actual table at lines 411-425.)

## Edge Cases

1. **`mode:` field missing from hint file** — Default to non-strict (`/orchestrate` form). Don't error.
2. **Hint file says `mode: strict` but user invoked plain `/orchestrate`** — The hint file persists strict mode across sessions. The current invocation honors the persisted mode and emits strict breadcrumbs.
3. **User invokes `/orchestrate --strict` when hint file says `mode: standard`** — Update hint file to `mode: strict` before any breadcrumbs are emitted. Strict mode wins on conflict.
4. **Bare `/orchestrate` breadcrumb in standard mode** — `/orchestrate` (no flag, no wrap). ✅
5. **Bare `/orchestrate` breadcrumb in strict mode** — `/orchestrate --strict` (flag, no wrap). ✅
6. **Wrapped breadcrumb with multi-arg inner command** — `/orchestrate --strict (/review-doc <spec> --max-iterations 4)` — flag goes between `/orchestrate` and the open paren, never inside the parens. ✅
7. **Phase-boundary breadcrumb in strict mode** — `/clear → /orchestrate --strict (/implement <plan>)` — `/clear → ` prefix is unchanged; flag still attaches to the orchestrate token. ✅
8. **Step 0 RED auto-handoff** — Prose stays, breadcrumb appended; breadcrumb is the literal last line of output. The `/session-handoff --light` call happens **inside** the orchestrate run, before the breadcrumb is printed.
9. **Breadcrumb after a tool-output display (e.g., diff preview)** — Tool output comes first, then a blank line, then the breadcrumb on its own line. The diff preview is informational; the breadcrumb is the exit signal.
10. **Mid-conversation clarifying question that requires a user answer** — No breadcrumb. The skill is not exiting; it's awaiting input.
11. **Error that retries internally before exiting** — No breadcrumb on the internal retry; only on the final exit.

## Verification

Per project conventions: no test suite. Manual verification:
1. Run `/orchestrate --strict` from Step 0; confirm every step boundary breadcrumb includes `--strict`
2. Read modified `SKILL.md` and confirm all 16 audit-list exit points have the breadcrumb as the literal last line
3. Force a RED handoff (manually flag context >80% in test) and confirm prose + breadcrumb both appear, prose first, breadcrumb last
4. Mid-conversation: trigger a clarifying question and confirm NO breadcrumb is appended
5. Trigger an Error Handling row and confirm the new Breadcrumb column matches the last line of output
6. Verify `mode: strict` persists in hint file across a step transition

---

**Summary of this spec:**
- Strict-mode flag echoes in all three breadcrumb forms (bare, wrapped, phase-boundary) by reading `mode:` from the hint file before emitting
- All 16 breadcrumb-emitting exit points are audited and fixed so the breadcrumb is the literal last line of the response
- New "When NOT to emit a breadcrumb" subsection prevents accidental breadcrumbs on mid-conversation prompts; RED auto-handoff calls `/session-handoff --light` and appends a breadcrumb after its prose

**Decisions taken implicitly:**
- The `--light` flag on `/session-handoff` is a known follow-up to a different skill — Item 03 only specifies that orchestrate calls it. If you'd rather block this spec on the `/session-handoff --light` flag landing first, let me know
- RED auto-handoff keeps the prose AND adds a breadcrumb (both formats coexist) rather than replacing prose with a breadcrumb. Rationale: prose is human-readable context, breadcrumb is the copy-paste target — they serve different purposes
- All 16 audit-list sites are listed inline so the implementer has a checklist; if any site turns out to not match the description, the implementer flags it back rather than silently adapting
