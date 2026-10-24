# Cell: R4b conflicts between cells
**ID:** r4b-conflicts-between-cells
**Area:** tools-cellmode
**Opened:** 2026-10-24 · **Status:** ✔
**Operation:** Revisao v2 ate R10b
**Base commit:** 3643f8167f1879a6406d68c7d8e595cc6a14fc0c
**Objective:** Mechanical conflict crossing between cells of an operation. Conflicts named by the orchestrator: none with R8 (observer only imports tools/cellmode; R8 must not depend on conflicts.mjs)
**Boundary:** in: new tools/cellmode/conflicts.mjs and its test, tools/cellmode/{commands,main,args,cell-in-operation,cell-in-operation-rules}.mjs, tools/cellmode/README.md, docs/02-cell-lifecycle.md and AGENTS.md:19 truth lines only | NOT in: check.mjs findings (R5), report (R7), eip/**, apps/**, skills/**, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** conflicts <cell> crosses Boundary in-paths, Dependencies and pack resources of the target cell against every active cell of the operation and prints a table; open inside an operation runs it: overlapping in-paths refuse (exit 3) unless --confirm, recorded in the log; a shared resource only warns; without an operation nothing changes; every file <= 200 lines; node --test green; verify:final green
**Last fact:** New tools/cellmode/conflicts.mjs (199) + 10 tests: conflicts <cell> crosses Boundary in-paths (equal, directory prefix at a segment boundary, glob), NOT-in holes, Dependencies and pack batches against every other active cell of the operation and prints an overlap/shared/none table; open inside an operation runs it before any write: overlap exits 3 unless confirmed, recorded as 'accepted by human'; shared warns and is recorded; none is recorded. cell-in-operation.mjs 174, -rules 141, commands.mjs 180, main.mjs 95, README.md 200; AGENTS.md:19 and docs/02 updated: crossing built, only the remaining check findings PROPOSED. Integrated from a worker worktree outside the repository, byte-identical copy.
**Build/typecheck:** green on main (typecheck clean; node --test 1547 pass / 0 fail / 0 skipped; gates clean; verify:final next)
**Decisions:** A crossing against nobody is not a crossing: the first cell of an operation writes no Conflicts entry (keeps an existing assertion in operation-status.test.mjs green); a declared dependency between cells is shared, never a refusal
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
