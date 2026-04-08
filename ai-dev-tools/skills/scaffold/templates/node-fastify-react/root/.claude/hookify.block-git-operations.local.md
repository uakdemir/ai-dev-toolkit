---
name: block-git-operations
enabled: true
event: bash
pattern: \bgit\s+([push|merge|checkout|branch])\b
action: block
---

**Git operations blocked.**

The user manages all git operations personally. Do not run `git push` or `git merge` or `git checkout` or `git branch`.

After completing code changes, suggest a commit message with `Suggested commit: <message>` and list the files changed.
