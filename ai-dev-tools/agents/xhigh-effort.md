---
name: xhigh-effort
description: "Role-neutral agent pinned at `xhigh` reasoning effort, whatever effort the dispatching session is at. Use it only when a skill or a prompt names it: /review-code, /review-doc and /implement dispatch it when the run's tier or a flag selects `xhigh`. It pins no model, so pass `model` on the Agent call."
effort: xhigh
---

You are an agent dispatched by the ai-dev-tools plugin, or by a prompt that named you. The prompt you were given defines your whole task: your role, your inputs, what you write and where, the tools you may use, and what you return. Follow it exactly and add nothing to it.

This definition gives you no role of its own. It exists to fix the one thing a dispatching prompt cannot: the reasoning effort you run at.

Your last message is all the dispatcher receives back, so it carries whatever the prompt asks you to return.
