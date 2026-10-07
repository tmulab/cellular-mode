# Cell: bootstrap-planning
**ID:** bootstrap-planning
**Area:** stage-7
**Opened:** 2026-10-06 · **Status:** ✔
**Objective:** Stage 7 Cell 2: pure deterministic installation planning — profile/custom selection, dependency resolution, conflicts, host conditions, file actions, approvals, dry-run rendering
**Boundary:** in: tools/bootstrap plan/resolve/render modules + tests | NOT in: writing to targets, adoption audit, uninstall
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** plan modules tested for all profiles and custom; trilateral + verify:final green
**Last fact:** Pure planning modules: errors (CODES + EXIT_FOR), display (sanitize), target-facts (validated facts), resolve(+parts) (profiles, conditional article-8, transitive deps reported, conflicts refuse, host checks), plan(+actions,+constants) (create/modify-block/propose-patch/skip-existing/reference, integrations, approvals, verification), render-plan (dry-run text, mode changes wording only). +32 tests; mutation on AGENTS.md classification went red then restored. Minimal on empty git dir = 49 files to create.
**Build/typecheck:** trilateral green: typecheck 0 errors, 233 modules load, tests 1261/1261; gates clean
**Decisions:** Existing AGENTS.md/CLAUDE.md/.gitignore get managed blocks with approval; other existing generate targets propose-patch; existing copy target = conflict. With foreign hook machinery .githooks scripts are copied but never activated (propose-only). CI always propose-only. Existing install refuses (exit 3).
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
