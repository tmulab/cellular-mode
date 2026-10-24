# Cell: R10 swarm rehearsal
**ID:** r10-swarm-rehearsal
**Area:** tools-cellmode
**Opened:** 2026-10-24 · **Status:** ✔
**Operation:** Revisao v2 ate R10b
**Base commit:** 9d0f3ba14905fa646141e822051acc93c6bca3cb
**Objective:** A test that replays 22-23/10 on a temp vault and proves the finish line does not move. Conflicts named: none active
**Boundary:** in: new tools/cellmode/rehearsal-swarm.test.mjs (<= 200) and, only if needed, a fixture helper tools/cellmode/rehearsal-fixture.mjs | NOT in: every existing module and test, docs, skills, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** node --test runs the rehearsal: op open with 5 finish-line items, pack with max-active-cells and a denied list, 10 planned cells; open up to the ceiling, refuse the next with exit 3; an overlapping boundary refused; an unplanned cell refused then amended; closes with spend and discoveries parked; finish-line fingerprint identical at the end; check green; report deterministic; op complete refused with an active cell and accepted after; the full suite green; verify:final green
**Last fact:** tools/cellmode/rehearsal-swarm.test.mjs (172) with rehearsal-helpers.mjs (89): replays 22-23/10/2026 in a temp git repository — op open with 5 frozen items and 10 planned cells; 4 cells up to the ceiling, the 5th refused (exit 3); an overlapping boundary refused; an unplanned cell refused then amended without moving the fingerprint; closes with spend, discoveries parked; a stale worker (Base commit on a side branch) reported as cell-stale; report byte-identical twice; op complete refused with an active cell, accepted after; finish-line fingerprint identical from opening to closing. 7 subtests. Not covered: a positive merge-unrecorded case (kept in check-git.test.mjs). Integrated from a worker worktree outside the repository.
**Build/typecheck:** green on main (node --test 1599 pass / 0 fail / 0 skipped; verify:final next)
**Decisions:** Helper named rehearsal-helpers.mjs instead of rehearsal-fixture.mjs because the cellmode-cli bootstrap manifest would ship a -fixture.mjs file to adopters (parked gap)
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
