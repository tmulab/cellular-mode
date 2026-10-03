# Cell: Observer advisor
**ID:** observer-advisor
**Area:** eip/plugins/observer-advisor, apps/observer ADVISOR area
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Optional, disabled-by-default advisory capability behind a provider-independent model interface, tested with deterministic fixtures
**Boundary:** in: model adapter interface, fixture adapter, bounded context, grounding check, limits, on-demand and silent modes, ADVISOR view | NOT in: real model providers, network, weights, any execution of model output
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** acceptance criteria verified by tests; observer and auditor work with advisor absent; gates and release gate green
**Last fact:** observer.advisor (eip/plugins/observer-advisor, V1-V23 written first): provider-independent ModelAdapter registry owned by the host, fixture adapter only, network adapters refused unless allowNetwork; permissions []; bounded context 8 KiB with dropped list; strict JSON validation + grounding downgrade to UNKNOWN; limits 20 calls, 2000 ms interval, enforced deadline (defect found: abort was requested not enforced, fixed); ADVISOR area labels AI interpretation; disabled by default (404 without the advisor flag, verified live); injection question produced 3 labelled recs and no side effect, vault bytes unchanged; literal invisible/bidi characters in 3 files replaced by escapes (Trojan Source hygiene); typecheck 0, 491/491 tests, gates and release gate green
**Build/typecheck:** green
**Decisions:** advisor output is untrusted data, never executed; no remote adapter ships; local SLM integration stays PENDING
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
