# Cell: UPP application plugins
**ID:** upp-application-plugins
**Area:** eip/upp application manifests, eip/upp-host app registry, examples/upp-app-nextjs, docs/adr/0001
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Register and supervise independently executed application plugins (e.g. Next.js) without loading them into the kernel
**Boundary:** in: application manifest section, registration and health supervision, a minimal runnable app fixture, Next.js contract example, ADR 0001 update, security docs | NOT in: a production Next.js app, proxying the frontend through the kernel
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** cell-5 criteria green; application registration tested against a real local server; final verification authorized
**Last fact:** application plugins: closed application section (relative health and route paths, exact CORS origins, capabilities empty), operator applications list with managed or external supervision, origin-locked no-redirect health checks, registry state machine with one restart max via the existing spawn site, adapter refuses application manifests (no kernel service or port), optional applications array in GET /api/v1/plugins (OpenAPI additive), runnable fixture app proving the client direction (its consequential call gets 403 APPROVAL_REQUIRED without approver); defect found: startup probe marked an app unhealthy before it bound, fixed; ADR 0001 amended pending human confirmation; Next.js example manifest validates, code UNTESTED; 22 new tests, 939/939; 6 mutations red
**Build/typecheck:** green
**Decisions:** registration is not in-process execution; an application is a client of the host API, never a kernel participant
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
