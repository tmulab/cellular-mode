# Cell: pb3-test-correction
**ID:** pb3-test-correction
**Area:** stage-8
**Opened:** 2026-10-08 · **Status:** ✔
**Objective:** Human-authorized minimal correction: bootstrap-draft.test.mjs handles Builder-present and Builder-absent sources (PB3 regression)
**Boundary:** in: tools/bootstrap/bootstrap-draft.test.mjs, report note | NOT in: any behaviour change
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** test both worlds; single final sequence BS1, AD29, PB3, verify:final
**Last fact:** PB3 failure of the first Stage 8 closing run was deterministic and identified: bootstrap-draft.test.mjs:126 expected 'no project contract in the target' while a Builder-absent source correctly reports 'Prompt Builder not installed in the source' first. Test now branches on BUILDER_HERE (tools/prompt-builder/cli.mjs present), as bootstrap-install.test.mjs does; H1 assertion (no draft promoted to a contract) unchanged in both worlds; compose-builder.mjs untouched. Builder-present world 6/6. This does not explain the Stage 7 PB3 failure (test did not exist then): UNKNOWN. The 1477/1478 verify-final failure: UNKNOWN, not reproduced in 10 full-suite runs and 20+20 isolated suspect runs. Report section 7 updated.
**Build/typecheck:** bootstrap-draft 6/6; typecheck 0 errors; size/leaks/links pass
**Decisions:** Correction authorized by the human on 2026-10-08; test expectations only.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
