# Cell: Host API and OpenAPI
**ID:** host-api-and-openapi
**Area:** eip/host, api/openapi.json, examples/api-client, docs/adr
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Composition host with HTTP API contract for independent frontends + dev UI + frontend ADR
**Boundary:** in: HTTP API, sandboxed write port, dev UI, OpenAPI, ADRs | NOT in: production frontend
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** ACCEPTANCE H1-H12 + OpenAPI contract test + smoke
**Last fact:** eip/host/{index,router,body,errors,write-port,dev-ui,cli}.mjs; api/openapi.json 3.1 with routes<->docs test; examples/api-client; docs/adr/0001-frontend-exception.md, 0002-zero-dependency-kernel.md; kernel defect fixed: async approver now awaited (3 failing tests first); smoke: save-report 403 APPROVAL_REQUIRED, dev page strict CSP; symlink guard test skipped (EPERM, UNVERIFIED)
**Build/typecheck:** green
**Decisions:** 127.0.0.1 only, no CORS, HTTP callers can never self-approve; CANCELLED 503, TIMEOUT 504, DEPENDENCY_IN_USE 409; ADRs pending human confirmation
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
