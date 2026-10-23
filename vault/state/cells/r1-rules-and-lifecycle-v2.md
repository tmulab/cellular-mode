# Cell: R1 rules and lifecycle v2
**ID:** r1-rules-and-lifecycle-v2
**Area:** method-docs
**Opened:** 2026-10-23 · **Status:** ✔
**Objective:** Rewrite the seven rules and the lifecycle docs for operations with parallel cells (plan v2 of 2026-10-23, decisions c/c), text only
**Boundary:** in: AGENTS.md, docs/02-cell-lifecycle.md, docs/03-state-and-memory.md, docs/04-collaboration.md, adaptive/policies/boundaries.md, tools/adaptive/README.md (size table only; scope widened by the human 2026-10-23) | NOT in: skills/*, tools/cellmode/*, apps/observer/*, eip/*, vault/state of other projects, any CLI behaviour
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** AGENTS.md <= 60 lines with the seven rules as in plan v2 section 3.2; docs/02 lines 111-117 no longer an open issue and describe operation + parallel cells + conflict naming; docs/03 documents operations/<slug>.md and the Operation field; docs/04 approval table gains the authorization pack row; boundaries.md gains the operation/cell/pack line; npm test green; verify:final green
**Last fact:** Plan v2 (2026-10-23) cell R1: AGENTS.md rewritten with the seven rules for one active operation + parallel cells (54 lines, budget 55); docs/02-cell-lifecycle.md (172) gains 'Operations and parallel cells' and the conflict-naming step, old open issue 3 rewritten; docs/03-state-and-memory.md (200) documents operations/<slug>.md, the Operation/Base commit/Spend fields, operation log entries, pack amendments and the CURRENT-CELL projection with an operation; docs/04-collaboration.md (134) gains two approval rows and 'The authorization pack'; adaptive/policies/boundaries.md gains the invariant bullet (12 lines, 896 bytes); tools/adaptive/README.md size table re-measured (tired 2032 / explore 2015 / focus 1930 of 2048). Operation support is text only: CLI enforcement PROPOSED for R3-R5. Parked: bootstrap templates and README mirrors of the rules, v1.0.0 guides/preprints revision, stale 4,365-byte figure.
**Build/typecheck:** green (typecheck clean; node --test 1478 pass / 0 fail / 0 skipped after the coder's last write; verify:final runs next as the last action before commit)
**Decisions:** Model (c): several active cells inside one active operation; unplanned cell needs the human's yes as a pack amendment; pack never grants destructive ops, protected resources or gate/test skipping; human widened R1 to tools/adaptive/README.md to land the boundaries line
**Open issues:** none inside the boundary; context-block headroom is now 16 bytes at the worst mode (tired), so the next adaptive change must re-measure
**Minimal context (≤5 lines):** plan v2 lives outside the repo (cm-revisao-20261023/plano-revisao-enxame.md under the tmp folder); four files done, one blocked; no commit yet; verify:final must be the last action before the commit

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
