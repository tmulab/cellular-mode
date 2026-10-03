# Cell: Claude Code and agent integration
**ID:** claude-code-and-agent-integration
**Area:** adapters/claude-code, .claude/skills, tools/adaptive hook, skills/cell, AGENTS.md
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Apply the declared mode reliably in Claude Code and portably in other agents, with the smallest mechanism
**Boundary:** in: user-only mode skills, opt-in hooks, cell skill step, AGENTS.md pointer, context cost, manual validation | NOT in: observer, enabling hooks for adopters by default
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** hook and skill paths tested with fixtures; natural language never sets a mode; release gate green
**Last fact:** 8 user-only Claude Code mode skills (disable-model-invocation, byte-identical in adapter and root; the live harness listing omits them from model-invocable skills); opt-in hooks via tools/adaptive/hook.mjs and adapters/claude-code/settings.adaptive.json, no repo settings file; only an exact slash command sets a mode (30-case no-inference table; live: estou cansado sets nothing); 0 bytes per unchanged turn, reprint on change/new session/compact; skills/cell +3 lines, AGENTS.md 51 lines; MANUAL-VALIDATION.md NOT YET PERFORMED; context cost measured; 653/653 tests, gates and release gate green
**Build/typecheck:** green
**Decisions:** hooks stay opt-in because they run without a trust prompt; skill-vs-builtin precedence is UNKNOWN, fallback names documented not shipped; pause skill's any-sign-of-fatigue trigger conflicts with no-inference: raised to the author
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
