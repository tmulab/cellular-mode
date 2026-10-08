# Cell: hardening-triage
**ID:** hardening-triage
**Area:** stage-8
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Stage 8 Cell 1: triage all 25 adoption-trial findings (FIX NOW / DOCUMENT NOW / DEFER / EXPECTED / UNKNOWN) and fix the hardening contracts
**Boundary:** in: ADOPTION_HARDENING_REPORT.md triage section | NOT in: implementation
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** triage recorded with rationale
**Last fact:** Triage of the 25 trial findings recorded in ADOPTION_HARDENING_REPORT.md section 1: FIX 16, DOC 6, DEFER 1 (A-15), EXPECTED 2 (A-16, B-01), UNKNOWN 0 (componentVersion difference stays UNKNOWN, not acted on). Contracts H1-H8 in section 2.
**Build/typecheck:** doc only; no code
**Decisions:** H7 Windows: resolve npm/npx shims to their Node entry points as argv (no shell); shell wrappers stay refused.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
