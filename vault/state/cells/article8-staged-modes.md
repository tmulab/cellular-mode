# Cell: article8-staged-modes
**ID:** article8-staged-modes
**Area:** stage-7
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Human-approved: workingTreeId seeds its temporary index from a copy of the real index so staged file modes survive core.filemode=false; githooks-mode test skips outside a git work tree
**Boundary:** in: tools/gates/fingerprint.mjs workingTreeId, its tests, tests/githooks-mode.test.mjs, FINAL-VERIFICATION.md note | NOT in: any other gate or bootstrap change
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** mode-only change authorizable; rehearsals x3 + verify:final green; commit, push, CI
**Last fact:** Demonstrated: workingTreeId seeded its throwaway index from HEAD, so with core.filemode=false a staged mode-only change (hooks 100644 to 100755) was lost; verify:final authorized tree 7bcc6bd9 while the staged tree was 51a74c23 and the pre-commit check refused. Fix (human-approved): seed from a copy of the real index (git rev-parse --git-path index), fallback to read-tree HEAD; real index untouched. tests/gates-tree-modes.test.mjs (4 tests; mutation back to read-tree HEAD went red). githooks-mode test skips outside a git work tree (it broke the three rehearsals, whose copies have no .git). FINAL-VERIFICATION.md sentence updated.
**Build/typecheck:** trilateral typecheck 0 errors, 279 modules, tests 1432/1432; gates release no blockers; workingTreeId equals stagedTreeId on this repo
**Decisions:** Article 8 core change approved by the human on 2026-10-07; contents still come from the working tree, only recorded modes are preserved.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
