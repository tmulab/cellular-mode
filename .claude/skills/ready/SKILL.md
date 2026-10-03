---
name: ready
description: Declare the READY working mode of Cellular Adaptive (the default: normal detail, relevant alternatives, broader planning. Stores nothing). Trigger: /ready. Invoked by the human only; this skill never changes anything else.
disable-model-invocation: true
---

# ready (pointer)

Run `node tools/adaptive/cli.mjs set ready --source skill`, then
`node tools/adaptive/cli.mjs context` and follow the block it prints. Empty output
means the default: work normally.

Only the human can invoke this skill, so the declaration it records is the human's.
Procedure, boundaries and alias table: `skills/mode/SKILL.md`. A mode never changes a
gate, an approval, a security report or a test.
