# Cell: Observer dashboard
**ID:** observer-dashboard
**Area:** eip/plugins/observer-state, apps/observer, tools/cellmode (deps option)
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Read-only Observer plugin plus independent local dashboard reusing the original painel
**Boundary:** in: state reading via a confined read port, overview, cell graph from declared dependencies only, cell details, timeline, 2D/3D views, text alternative | NOT in: auditing, advisor, any write to project state
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** acceptance criteria O1-On verified by tests, gates and release gate green, manual visual checklist documented
**Last fact:** observer.state plugin (eip/plugins/observer-state, O1-O18) on existing SDK/host via path-confined fs.read vault port (eip/host/read-port.mjs) and eip/host/observer-composition.mjs; parsing reuses tools/cellmode pure modules (boundary rule: named pure modules only); cellmode open/plan gained a deps option (slugs); kernel passthrough of NOT_FOUND/INPUT_INVALID only (authority codes cannot be forged, K14); apps/observer independent local app ported from the original painel (2D SVG default, optional 3D, shared selection, text alternative), allowlist static server + /api/v1 proxy, strict CSP, 127.0.0.1 only; three.js r180 vendored byte-identical (SHA-256 pinned, MIT notice); ADR 0003; examples/observer-demo reproducible vault; typecheck both configs 0 errors; 405/405 tests; gates and release gate green; live smoke: 404 on unknown cell/traversal/repo/vault files, no absolute paths, demo vault bytes unchanged; browser manual checks documented, NOT YET PERFORMED
**Build/typecheck:** green
**Decisions:** edges only from declared Dependencies; timeline only from logged events (open/resume not recorded by the protocol); status vocabulary unified as words with symbol alongside; no Next.js (ADR 0003, pending human confirmation)
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
