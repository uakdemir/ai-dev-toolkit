---
name: brainstorm
argument-hint: "[topic]"
description: "Use when the user wants to brainstorm a feature, a change or an idea into a written spec — runs superpowers:brainstorming so that it ends with a committed spec under docs/superpowers/specs/, and prints the /review-doc command for it. The first step of the brainstorm → review-doc → implement → review-code workflow."
---

<help-text>
/brainstorm — brainstorm an idea into a committed spec

Usage: /brainstorm [topic]

Arguments:
  topic            What to brainstorm, in plain words (optional: without it,
                   brainstorming starts by asking)
  --help           Show this help

Examples:
  /brainstorm                                   # start by asking
  /brainstorm rate limiting for the public API  # start from a topic
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside `<help-text>` tags above verbatim. Do not execute any skill logic.

# brainstorm

The first of the four skills the team runs by hand, in this order. Each one prints the command for the next:

```
/ai-dev-tools:brainstorm      → writes and commits the spec
/ai-dev-tools:review-doc      → reviews the spec until it is sound
/ai-dev-tools:implement       → decides whether a plan is needed, then implements
/ai-dev-tools:review-code     → reviews the commits since /implement started
```

This skill is a wrapper. `superpowers:brainstorming` does the brainstorming; the override below makes a committed spec its terminal state, so that the next skill has a file to read.

## Steps

1. Invoke `superpowers:brainstorming` with the topic and this override:

   > The terminal state is a spec in `docs/superpowers/specs/`, committed after its self-review. Do not invoke writing-plans or any implementation skill. Skip the "user reviews written spec" gate: /review-doc is that review. A bounded request still gets a short written spec instead of in-chat implementation, because the next skill reads a file. A spike ends as brainstorming defines it, with findings and no spec.

2. If brainstorming still proposes writing-plans or implementation, decline it and continue with step 3.
3. When a spec was committed, print the next command, alone, as the run's final output:

   ```
   /ai-dev-tools:review-doc <spec-path>
   ```

   `<spec-path>` is the committed spec's path, relative to the repository root. A spike prints no command.
