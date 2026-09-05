# Orchestrate Help

```
orchestrate — Manage your full development cycle

USAGE
  /orchestrate [--auto <spec>] [--handoff] [--use-roadmap] [--help]

FLAGS
  --auto <spec>      Run the agent pipeline on one spec.
                     Post-brainstorm run — no user interaction.
  --handoff          Load tmp/session-handoff.md and resume (standard only)
  --use-roadmap      Enable refactor-unit routing via roadmap match (standard only)
  --help             Print this help and exit

INCOMPATIBLE
  --handoff + --auto     (--handoff is standard-mode only)
  --use-roadmap + --auto (refactor-unit requires interactive flow)

MODES
  Standard (default)   Manual step-by-step flow, one step per invocation
  Auto (--auto)        Agent pipeline: spec-review → implement → code-review → verify

EXAMPLES
  /orchestrate                         Detect state and suggest next step
  /orchestrate --handoff               Resume from session handoff
  /orchestrate --use-roadmap           Enable refactor-unit routing
  /orchestrate --auto spec.md          Run full pipeline on one spec
  /orchestrate --auto s1.md            Run the pipeline on one spec
```
