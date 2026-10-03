# Cell: Adaptive contracts and policy model
**ID:** adaptive-contracts-and-policy-model
**Area:** MDAA references (read-only), tools/adaptive (planned), docs
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Ground Cellular Adaptive in the MDAA principles actually documented and define the adaptive contracts and policy model
**Boundary:** in: MDAA inspection, agent mechanism research, state and policy contracts, ADR | NOT in: persistence code, commands, observer changes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** contracts and policy model written with acceptance criteria, MDAA mapping traceable to sources
**Last fact:** adaptive/policies (boundaries + 4 modes, on-demand), tools/adaptive/{modes,types,schema}.mjs pure contracts, ACCEPTANCE AD1-AD26, docs/10-adaptive.md with MDAA principle table (transfer labelled ours/experimental), ADR 0004 pending confirmation, boundary rule adaptive-is-optional-and-isolated; 25 new tests + 5 gate tests, 5 mutations red; 565/565 tests, gates and release gate green
**Build/typecheck:** green
**Decisions:** contracts first; preferences can never store a mode or condition; only the active mode's policy is ever loaded
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
