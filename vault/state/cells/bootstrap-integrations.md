# Cell: bootstrap-integrations
**ID:** bootstrap-integrations
**Area:** stage-7
**Opened:** 2026-10-06 · **Status:** ✔
**Objective:** Stage 7 Cell 5: verification contract + BS3 generalization of verify-final, hooks activation with approval, CI workflow proposal/creation with approval, verification.json from discovered commands
**Boundary:** in: tools/gates verification-contract + verify-final generalization (BS3), tools/bootstrap hooks/ci/verification modules, templates, tests | NOT in: uninstall/drift (Cell 6), security hardening pass (Cell 7), docs
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** verify-final unchanged without contract (proven), contract path fail-closed and argv-only; hooks/CI only with approval; trilateral + verify:final green
**Last fact:** BS3 implemented: tools/gates/verification-contract (single validator, argv-only, shell wrappers refused, mandatory needs VERIFIED or human approval), verification-argv, verification-suite (MANDATORY_SUITE moved verbatim; selectSuite returns it by identity when vault/verification.json is absent; present: mandatory checks + cell-state; invalid/zero mandatory: fail closed). Bootstrap: verification generator, integrate-hooks (core.hooksPath only under six conditions, else composition plan), integrate-ci (new SHA-pinned contents:read workflow only with approval), apply-integrations, ci-github template. End-to-end Article 8 in a target VERIFIED by test (commit refused, verify-final passes, commit accepted with trailer, later write revokes). +27 tests; no-shell proof; mutation on mandatory rule red then restored.
**Build/typecheck:** trilateral green: typecheck 0 errors, 268 modules load, tests 1375/1375; gates release no blockers
**Decisions:** One validator in tools/gates; bootstrap only builds data, round trip tested in tests/. CI-parsed commands become notes, not checks. Human approval may promote INFERRED to mandatory (per BS3). Evidence record unchanged (suite source printed only). rules.mjs and policy untouched.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
