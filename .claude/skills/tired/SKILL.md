---
name: tired
description: Declare the TIRED working mode of Cellular Adaptive (concise answers, one decision at a time, small steps, the active cell only). Trigger: /tired. Invoked by the human only; this skill never changes anything else.
disable-model-invocation: true
---

# tired (pointer)

Run `node tools/adaptive/cli.mjs set tired --source skill`, then
`node tools/adaptive/cli.mjs context` and follow the block it prints. Empty output
means the default: work normally.

Only the human can invoke this skill, so the declaration it records is the human's.
Procedure, boundaries and alias table: `skills/mode/SKILL.md`. A mode never changes a
gate, an approval, a security report or a test.
