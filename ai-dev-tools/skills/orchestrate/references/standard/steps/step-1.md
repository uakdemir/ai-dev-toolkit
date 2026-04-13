# Step 1: Brainstorm

**Trigger:** No spec in `docs/superpowers/specs/` for current feature.

---

## Action

Check `tmp/current-roadmap.md` for next item. Invoke `superpowers:brainstorming`.

Edge: superpowers plugin missing → warn, offer manual spec creation.

## Roadmap Integration (only when `--use-roadmap` was passed)

Load `references/standard/refactor-roadmap-check.md` for refactor-unit routing logic. If a roadmap has unchecked items and no active spec for the next unit, suggest: "Next unit: `<name>`. Start brainstorming?"

If user confirms, invoke the originating refactor skill with `--next-unit`. After completion, write hint (feature: <next-unit-name>, step: 2) and exit.

## Breadcrumb

After brainstorming completes:
- If brainstorming produced a spec file:
  ```
  /commit
  /orchestrate (/review-doc <spec_path> --max-iterations 2)
  ```
- If brainstorming produced no spec file:
  ```
  /orchestrate
  ```
