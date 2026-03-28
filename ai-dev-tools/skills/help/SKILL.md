---
name: help
description: "Show available skills, workflows, strategies, and best practices for the ai-dev-tools plugin. Use when a user asks what commands are available, how to get started, or needs guidance on which skill to use."
---

# help

Print a help page listing all available ai-dev-tools skills, skill families, workflows, and best practices. `/help` takes no arguments and no flags. It prints and exits.

---

## AGENT INSTRUCTIONS — DO NOT PRINT THIS SECTION

The content below tells you (the agent) how to build the dynamic portions of the help output. Everything in this section is for your eyes only. Print only the content under "TERMINAL OUTPUT" further below.

### Step 1: Discover skills

Resolve the plugin root from this SKILL.md's location: two levels up from this file (`../../` relative to this file, i.e., the `ai-dev-tools/` directory). Glob `skills/*/SKILL.md` from the plugin root. This file (`skills/help/SKILL.md`) is excluded from the scan — do not include `/help` in the frontmatter scan.

For each discovered SKILL.md:
- Parse the YAML frontmatter to extract `name` and `description`.
- If frontmatter is missing, malformed, or either field is absent, skip that skill silently.

### Step 2: Build the COMMANDS table

Produce a two-column indented plain-text list (not a markdown table). Each row is a slash command left-aligned with its description right-aligned after spacing. Use this exact format per row:

```
  /skill-name                        Short description here
```

Left-pad each row with 2 spaces. Use a minimum 2-space gap between the longest command and its description; shorter commands get more padding so descriptions align.

**Row ordering:**
1. First row: `/help` — hardcoded description `This help page`
2. Second row: `/orchestrate` — description derived from its frontmatter (per truncation rules below)
3. Remaining rows: all other discovered skills, sorted alphabetically by skill name

**Description truncation rules (max ~60 chars):**
- Strip any "Use when ..." prefix and take the first actionable clause instead.
- Truncate at a word boundary at ~60 characters; append `...` if truncated.
- Prioritize what the skill *does* over usage syntax.
- Exact wording may vary between invocations — aim for clarity and brevity.

Example derivations from frontmatter:
- `"Use when the user wants to audit test quality, find coverage gaps..."` → `Audit test quality and find coverage gaps`
- `"Iterative code review loop between Claude and Codex..."` → `Iterative Claude-Codex code review loop...`

**Skills with subcommands** (e.g., `consolidate` with `/consolidate ai`, `/consolidate lint`, `/consolidate all`) are listed as a single row using the parent command name only.

### Step 3: Build the SKILL FAMILIES section

Use the static family mapping below. For each family, list only the member skills that were actually found during the scan (skip missing ones silently). Format each family as an indented line with the family name left-aligned, followed by members comma-separated. Wrap long member lists to align with the first member:

```
  Review & Quality    review-doc, review-doc-ralph, review-code,
                      review-code-ralph, test-audit
```

Any non-help skill found during the scan that does not appear in any family below goes into an "Other" family at the end, using the same comma-separated format.

The `help` skill itself does not appear in any family.

**Static family mapping:**

| Family | Members |
|--------|---------|
| Review & Quality | review-doc, review-doc-ralph, review-code, review-code-ralph, test-audit |
| Documentation | document-for-ai, session-handoff, changelog-from-commits |
| Refactoring | refactor-to-layers, refactor-to-monorepo, implement-plan |
| Conventions | convention-enforcer, api-contract-guard, consolidate |
| Orchestration | orchestrate |

---

## TERMINAL OUTPUT — PRINT THIS VERBATIM (except COMMANDS and SKILL FAMILIES which are dynamic)

Print the following. Replace the `COMMANDS` table and `SKILL FAMILIES` content with the dynamically generated versions from Steps 2 and 3 above. All other content is static — print it exactly as written.

```
ai-dev-tools — AI-native development automation

COMMANDS
  [dynamic: insert generated table here]

SKILL FAMILIES
  [dynamic: insert generated families here]

WHERE DO I START?

  If you're new, start here:

  1. /orchestrate — your main entry point. It manages the full development
     cycle: brainstorm → spec review → plan → implement → code review → complete.
     Just re-invoke it and it picks up where you left off.

  2. After installing superpowers, /orchestrate becomes even more powerful —
     it delegates to superpowers:brainstorming for design,
     superpowers:writing-plans for planning, and
     superpowers:subagent-driven-development for implementation. Think of
     orchestrate as the conductor that tells you what to do next.

  3. For targeted work, go directly to a skill family:
     - Refactoring a messy codebase? /refactor-to-layers or
       /refactor-to-monorepo
     - Auditing test quality? /test-audit
     - Enforcing conventions? /convention-enforcer
     - Preparing docs for AI agents? /document-for-ai

COMMON WORKFLOWS

  "I'm starting a new feature"
    /orchestrate → walks you through brainstorm → spec → plan →
    implement → review → complete

  "I have a spec and want to review it"
    /review-doc path/to/spec.md
    /review-doc path/to/spec.md --against path/to/reference.md
      (cross-checks spec against a reference document)

  "I want automated review-fix cycles"
    /review-doc-ralph or /review-code-ralph — iterates with Codex
    until clean

  "I want to improve my codebase structure"
    /refactor-to-layers (enforce dependency layers)
    /refactor-to-monorepo (plan monorepo extraction)
    /implement-plan (execute either plan)

  "I'm handing off to another session"
    /session-handoff

TIPS

  - orchestrate detects state from artifacts (specs, plans, reviews
    in tmp/). No need to tell it where you are — just re-invoke
    /orchestrate.
  - ralph skills (review-code-ralph, review-doc-ralph) auto-iterate
    between Claude and Codex until zero critical issues. Use them
    when you want hands-off quality improvement.
  - review-doc dispatches 3 parallel agents (completeness, fact-check,
    implementability). Add --codex for single-pass Codex review instead.
  - All review output lands in tmp/ (review_analysis.md, review_code.md).
    Process findings with /respond-to-review (a separate user-level skill,
    not part of this plugin).
  - document-for-ai generates CLAUDE.md files and AI_INDEX.md — run it
    after major structural changes so AI agents stay oriented.
```
