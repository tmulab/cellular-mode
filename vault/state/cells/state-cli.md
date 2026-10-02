# Cell: State CLI
**ID:** state-cli
**Area:** tools/cellmode
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Make the file protocol deterministic instead of remembered
**Boundary:** in: tools/cellmode/ | NOT in: a dependency-free CLI with documented exit codes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** 33 tests green and every rule proven by a mutation
**Last fact:** Built tools/cellmode/cli.mjs with 16 modules (state.mjs is the only one touching the disk) and 33 tests in tools/cellmode/cli.test.mjs, integrity.test.mjs and pure.test.mjs. Exit codes 0/1/2/3/4/5 documented in tools/cellmode/README.md. Every protocol rule was mutation-proven: breaking the rule in the source makes a named test fail.
**Build/typecheck:** green
**Decisions:** The log is append-only by construction (appendFileSync); INDEX.md, CURRENT-CELL.md and cells/*.md are projections and are rebuilt from it. Added one field to the log entry format: an explicit Status line, so check can compare the log with INDEX.md mechanically.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
