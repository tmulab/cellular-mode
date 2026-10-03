# Cell: Adaptive state and temporal validity
**ID:** adaptive-state-and-temporal-validity
**Area:** tools/adaptive (io, validity, state transitions, CLI)
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Persist the declared mode and optional preferences outside the vault with declared temporal validity
**Boundary:** in: io module, validity standing, transitions, CLI status/set/reset/enable/disable/clear, tests | NOT in: hooks, skills, observer
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** AD9-AD15 green with mutation proofs; release gate green
**Last fact:** tools/adaptive/{validity,transitions,io,main,cli}.mjs + README: declared mode in .cellular/adaptive/session.json (gitignored), ready deletes, half-open expiry with notice, disable keeps the file but ignores it, malformed state is invalid (exit 2) never deleted, preferences carrying a mode rejected; 49 tests, 5 mutations red; 614/614 tests, gates and release gate green; live CLI check with Portuguese aliases and expiry
**Build/typecheck:** green
**Decisions:** state stays outside the vault; main.mjs is the only clock/env reader
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
