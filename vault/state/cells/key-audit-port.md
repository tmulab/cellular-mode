# Cell: Key-audit port
**ID:** key-audit-port
**Area:** tools/key-audit
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Port and generalize the key-coverage auditor
**Boundary:** in: tools/key-audit/ | NOT in: a project-agnostic CLI that can gate CI
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** 13 tests green and the key prefix configurable
**Last fact:** Ported the original auditoria-chaves tool to tools/key-audit/ with 13 tests in tools/key-audit/key-audit.test.mjs. The key prefix and the scanned extensions are now options instead of hardcoded values. The three buckets are reported separately and there is deliberately no total field.
**Build/typecheck:** green
**Decisions:** Changed the exit codes: 2 when any declared key is prose-only or absent, where the original always returned 0. A report nobody can fail is not a gate.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
