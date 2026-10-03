# Cell: Observer auditor
**ID:** observer-auditor
**Area:** eip/plugins/observer-audit, tools/gates/trilateral.mjs evidence, apps/observer AUDIT area
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Deterministic audit findings with honest PASS/FAIL/WARNING/UNAVAILABLE/NOT_APPLICABLE statuses
**Boundary:** in: in-process pure checks via read ports, trilateral evidence file, findings API, AUDIT view | NOT in: repairs, process spawning, advisor
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** acceptance criteria verified by tests; no PASS without execution evidence; gates and release gate green
**Last fact:** observer.audit plugin (eip/plugins/observer-audit, A1-A20 written first) injecting observer.state; checks reuse pure gate and cellmode functions in-process via path-confined repo read port (eip/host/repo-read-port.mjs, created only when the auditor is loaded); typecheck/build/tests read from the evidence file written by trilateral --evidence (gitignored .cellular/), never PASS without it, stale evidence is WARNING; secrets findings carry rule and location only; AUDIT area in apps/observer; 8 mutations red; typecheck 0, 453/453 tests, gates and release gate green; live audit on this repo 11 PASS, 1 WARNING (active cell without next step, a real finding), 1 NOT_APPLICABLE; vault bytes unchanged
**Build/typecheck:** green
**Decisions:** one exclusion list shared by gates and auditor (tools/gates/exclusions.mjs); two explicit boundary allowlists in tools/gates/allowlists.mjs; the auditor never writes, spawns or repairs
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
