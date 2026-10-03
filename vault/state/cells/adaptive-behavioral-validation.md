# Cell: Adaptive behavioral validation
**ID:** adaptive-behavioral-validation
**Area:** scratchpad sandbox copy, tools/adaptive/VALIDATION-RESULTS
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Run the manual validation with the real Claude Code model and record observed behavior separately from deterministic checks
**Boundary:** in: sandbox copy with opt-in hooks, claude -p runs per mode and invariant, results document | NOT in: changing the repo's hooks, any code change unless a defect is found
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** every mission check run and recorded with model version, conditions, results and deviations
**Last fact:** behavioral validation with claude-opus-5-5 (CLI 2.1.283) in a sandbox copy: 13 checks passed n=1, all write attempts denied, 6 deviations recorded; deviation 1 (silent return to ready) fixed as AD32 and re-run live; AD29 found to be an unverified false claim by the lead's deletion rehearsal (2 static imports of the adaptive port), fixed with a guarded dynamic import, a static import test and npm run rehearse:adaptive-removal (31/31 paths deleted, suite and gates green); C:\tmp incident investigated read-only, uncertainty reported; 719/719 tests, gates and release gate green; prepared for the authorized local commit that follows this entry
**Build/typecheck:** green
**Decisions:** observed model behavior is evidence, not a guarantee; no push until authorized
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
