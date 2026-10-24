# Cell: R5 new check findings
**ID:** r5-new-check-findings
**Area:** tools-cellmode
**Opened:** 2026-10-24 · **Status:** ✔
**Operation:** Revisao v2 ate R10b
**Base commit:** 1e56c171afc76b04bdd391b93b665cfb7caecab7
**Objective:** check learns the operation layer. Conflicts named: none active (R8 paused, touches no cellmode file); map-stale belongs to R7
**Boundary:** in: tools/cellmode/check.mjs, new tools/cellmode/check-operation*.mjs and tests, tools/cellmode/README.md, AGENTS.md:19 and docs/02 truth lines | NOT in: report/map (R7), eip/**, apps/**, skills/**, tools/gates/**, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** check reports finish-line-moved (operation file fingerprint differs from the one in its opening log entry), pack-missing (active operation without a pack), pack-grants-forbidden (pack text a parsePack would reject), cell-stale (an active cell whose Base commit is not an ancestor of HEAD, UNKNOWN reported and never green without git), spend-over-ceiling, merge-unrecorded (a merge commit of a worker branch after the operation opened with no cell entry naming it; UNKNOWN without git); each with a test; existing findings and messages unchanged; every file <= 200 lines; node --test green; verify:final green
**Last fact:** check learns the operation layer through new check-operation.mjs (181), check-git.mjs (163) and check-layer.mjs (52), composed into readState so check.mjs (131) stays pure for the Observer: finish-line-moved, pack-missing, pack-grants-forbidden, spend-over-ceiling, cell-stale (Base commit not an ancestor of HEAD, or unrecorded) and merge-unrecorded (op/ or worktree-agent- merges with no log entry); 16 new tests; a vault without operations gives byte-identical output; state.mjs 200 gains listOperationTexts and skips a pack that throws. Orchestrator fixed the docs/03 guard paragraph under the human pack. check is green on this repository's live vault with the operation open. Integrated from a worker worktree outside the repository.
**Build/typecheck:** green on main (typecheck clean; node --test 1563 pass / 0 fail / 0 skipped; gates clean; verify:final next)
**Decisions:** Environment UNKNOWN (no git, no repo, no commit) prints a notice and keeps exit 0; data UNKNOWN with git present is a finding (human to confirm, parked); operations already done are exempt; merge range starts at the opening timestamp (INFERRED)
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
