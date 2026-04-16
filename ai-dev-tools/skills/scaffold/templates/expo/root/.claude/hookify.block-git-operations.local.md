---
name: block-git-operations
enabled: true
event: bash
pattern: \bgit\s+(push|merge|checkout|branch|rebase|reset|clean|stash)\b
action: block
---

**Git operations blocked.**

The user manages all git operations personally. Do not run `git push`,
`git merge`, `git checkout`, `git branch`, `git rebase`, `git reset`,
`git clean`, or `git stash`.

After completing code changes, suggest a commit message with
`Suggested commit: <message>` and list the files changed.
