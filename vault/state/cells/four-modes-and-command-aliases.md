# Cell: Four modes and command aliases
**ID:** four-modes-and-command-aliases
**Area:** tools/adaptive (context builder), skills/mode (agent-neutral)
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Make each mode's behavior loadable on demand from one portable command definition
**Boundary:** in: context builder per mode, agent-neutral mode skill with aliases, global --root position, tests | NOT in: Claude hooks and adapters, observer
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** context block per mode verified (only active policy + boundaries), aliases tested, release gate green
**Last fact:** tools/adaptive/context.mjs: header + boundaries + only the active policy, 2048-byte cap, refuses instead of truncating; measured tired 1999, explore 1963, focus 1878 bytes, ready/none/disabled 0; skills/mode/SKILL.md agent-neutral with EN/PT aliases; --root accepted anywhere (live UX bug fixed); 16 new tests, 5 mutations red; lead verified focus block holds 14/14 focus lines and 0/40 lines of the other modes; 632/632 tests, gates and release gate green
**Build/typecheck:** green
**Decisions:** only the active mode's policy is ever loaded; a missing policy is an error, never an empty block
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
