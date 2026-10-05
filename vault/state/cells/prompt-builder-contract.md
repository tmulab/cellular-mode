# Cell: prompt-builder-contract
**ID:** prompt-builder-contract
**Area:** stage-6
**Opened:** 2026-10-04 · **Status:** ✔
**Objective:** Stage 6 Cell 3: universal project contract validation, readiness, conflicts, decisions, publication check and approval
**Boundary:** in: tools/prompt-builder validate/readiness/conflicts/decisions/publication/approve modules + tests | NOT in: first cell, prompts, CLI, skills
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** contract modules tested incl. fixtures; trilateral + verify:final green
**Last fact:** Contract modules: validate(+parts), readiness, conflicts, decisions, publication, approve; store gains read/writeContract (confined to vault/, revalidates + publicationCheck, fail closed); sensitive gains email/phone detectors; readyContract fixture. +67 tests; two real mutation checks red then restored.
**Build/typecheck:** trilateral green: typecheck 0 errors, 203 modules load, tests 1147/1147; gates clean
**Decisions:** Approved decision promotes PROPOSED -> DECLARED with basis decision:<id> (techs move proposed->approved); rejected removes the PROPOSED entry, decision record is history; INFERRED never promotable; readiness counts only DECLARED/VERIFIED; approval never touches git or cells.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
