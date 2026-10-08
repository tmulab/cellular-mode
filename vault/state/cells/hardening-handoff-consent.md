# Cell: hardening-handoff-consent
**ID:** hardening-handoff-consent
**Area:** stage-8
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Stage 8 Cells 2+5 (same modules): Builder draft tolerated and never authoritative (A-01), draft git-ignored with explicit refusal warning (A-04), managed-block text and one complete approval list shown before consent in text and JSON (A-05/B-03, B-04), uninstall dry-run fully reviewable (B-12), untruncated limitation (A-13)
**Boundary:** in: tools/bootstrap new-flow/plan/render/templates/uninstall-render/install output + tests | NOT in: status semantics, verification CLI, Windows exec, builder questions, test isolation
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** contracts H1, H2, H5 implemented with regression tests; targeted tests + trilateral green
**Last fact:** H1: vault/builder never walked/planned/copied; new tolerates it; draft-only target promotes nothing. H2: gitignore block adds vault/builder/; refusal warns in plan and install output. H5: plan text and --json carry exact managed-block text and one complete approval list (existing adds baseline-checks); report list suppressed on install path (B-04). B-12 uninstall --verbose lists all. A-13 limitations printed whole. +12 tests (bootstrap-draft, bootstrap-consent).
**Build/typecheck:** trilateral typecheck 0 errors, 279 modules, tests 1444/1444; gates release clean
**Decisions:** Merged Cells 2 and 5 (same modules), one active cell kept.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
