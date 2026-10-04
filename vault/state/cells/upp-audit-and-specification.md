# Cell: UPP audit and specification
**ID:** upp-audit-and-specification
**Area:** docs/upp, docs/adr/0005
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Audit the existing plugin architecture and specify the Universal Plugin Protocol on established standards
**Boundary:** in: audit of SDK/kernel/host/HTTP/events/approval, UPP spec, ADR 0005, acceptance criteria for later cells | NOT in: implementation code
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** SPEC and ADR written with a traceable reuse map; final verification authorized
**Last fact:** docs/upp/AUDIT.md (30 capabilities with file:line evidence: 14 exist and are reused, 13 to build, 3 out of scope), docs/upp/SPEC.md + SPEC-MESSAGES.md (UPP 1.0 on JSON-RPC 2.0, NDJSON over stdio, existing schema subset, error mapping onto the closed kernel CODES with PASSTHROUGH preventing forged authority codes), docs/upp/ACCEPTANCE.md U1-U41, ADR 0005 pending human confirmation; api/openapi.json unaffected
**Build/typecheck:** green
**Decisions:** optional config member on upp.initialize approved by the lead (an out-of-process plugin must receive its validated config); PLUGIN_UNAVAILABLE maps onto PLUGIN_ERROR, no new kernel code
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
