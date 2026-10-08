# Cell: hardening-ownership
**ID:** hardening-ownership
**Area:** stage-8
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Stage 8 Cell 3: ownership classes immutable/evolving/user in status and uninstall (A-02/B-11, B-13, H3)
**Boundary:** in: tools/bootstrap status*/uninstall*/install-manifest* (minimal), tests | NOT in: other areas
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** normal work never drift; true modification/deletion/block edit still drift; uninstall safety unchanged; trilateral green
**Last fact:** H3: status-ownership.mjs derives immutable/evolving/user by frozen path rule (evolving: vault/state/**, vault/verification.json); evolved paths reported, never drift; modified block and immutable changes still drift/partial. B-13: status-residue.mjs reads the uninstall report; uninstalled-with-residue exit 0, no repair. Schema unchanged. +6 tests (bootstrap-status-h3).
**Build/typecheck:** trilateral typecheck 0 errors, 281 modules, tests 1452/1452; gates release clean
**Decisions:** Class derived from path rule, not a manifest field; old manifests valid.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
