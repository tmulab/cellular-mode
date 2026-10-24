# Cell: R7 generated map
**ID:** r7-generated-map
**Area:** tools-cellmode
**Opened:** 2026-10-24 · **Status:** ✔
**Operation:** Revisao v2 ate R10b
**Base commit:** 0f39733de8bcc9181a41bc52f2ad9ec553ffb4af
**Objective:** The map the human reads is generated from the log, never written by hand. Conflicts named: none active
**Boundary:** in: new tools/cellmode/report*.mjs and tests, tools/cellmode/{commands,main,args,state,check-layer,check-operation}.mjs, tools/cellmode/README.md, AGENTS.md:19 and docs/02 truth lines | NOT in: eip/**, apps/**, skills/**, tools/gates/**, vault/** except the generated vault/state/map.svg written only by report in temp roots during tests
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** cellmode report writes vault/state/map.svg deterministically from log.md, INDEX.md and operations/ (same vault, same bytes): header with the active operation, finish line with each item's state, cells by status with the last fact, what is waiting on the human (paused cells' next steps, parked items mentioning the human), totals; map-stale finding when map.svg exists and its embedded source fingerprint differs from the current log; no map file means no finding; every file <= 200 lines; node --test green; verify:final green
**Last fact:** cellmode report writes a deterministic SVG map from the vault: report-model.mjs (193) and report-svg.mjs (137) are pure, report-command.mjs (56) composes, I/O through state.mjs (199). Map shows the active operation with each finish-line item's state (slug match, at least two whole tokens), cells by status with last fact, what waits on the human (paused next steps, parked lines with 'human'), totals; every string XML-escaped; same vault, same bytes; a sha256 of log, INDEX and operations is embedded. New finding map-stale in check-report.mjs (47) fires when an existing map's fingerprint differs from the sources; no map, no finding. 15 new tests. Integrated from a worker worktree outside the repository.
**Build/typecheck:** green on main (typecheck clean; node --test 1592 pass / 0 fail / 0 skipped; gates clean; verify:final next)
**Decisions:** map-stale is reported by cmdCheck only, never by the guard that runs before transitions: a stale drawing must never refuse to record a closure (rule 2); no map.svg is committed in this repository, so the map is generated on demand instead of going stale; human approved the spend ceiling change to — (pack amendment in the log)
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
