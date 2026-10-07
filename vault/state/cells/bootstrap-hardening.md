# Cell: bootstrap-hardening
**ID:** bootstrap-hardening
**Area:** stage-7
**Opened:** 2026-10-06 · **Status:** ✔
**Objective:** Stage 7 Cell 7: security hardening pass, boundary rules for tools/bootstrap (strengthen only), bootstrap removal rehearsal, dry-run and idempotence proofs across all flows, threat model
**Boundary:** in: tools/gates rules (new bootstrap rules only), removal-paths MODULES bootstrap entry, tests/links + optional-module-imports for bootstrap, bootstrap/THREAT-MODEL.md, security/idempotence tests in tools/bootstrap | NOT in: docs/12, README, report (Cell 8), new features
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** rules + rehearsal green, threat model written, every flow dry-run/idempotence proven; trilateral + verify:final green
**Last fact:** Hardening done: 4 bootstrap boundary rules (isolated, method-only, transport-free, child_process only in exec.mjs) + tests; bootstrap/THREAT-MODEL.md; harden and idempotence matrix tests; BOOTSTRAP removal rehearsal entry. Optionality regression: (1) expandFiles raised raw ENOENT for an absent component source -> now COMPONENT_UNAVAILABLE (exit 2) naming component and relative path, profile refused whole, unselected absent components produce no finding, status/uninstall need no sources; (2) bootstrap-compose tests used the repo itself as Builder-present source -> stub source fixture, exit-code branches now run in both worlds. Rehearsals: BS1, AD29, PB3 all VERIFIED.
**Build/typecheck:** trilateral green: typecheck 0 errors, 279 modules load, tests 1426/1426; gates release no blockers; three rehearsals VERIFIED
**Decisions:** Scope freeze (human, 2026-10-06). Both-worlds test branching instead of listing bootstrap tests in other modules' removal paths. Cell closed without a per-cell verify:final: the human requested exactly one final verification after all Stage 7 writes.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
