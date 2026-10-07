# Cell: bootstrap-new-project
**ID:** bootstrap-new-project
**Area:** stage-7
**Opened:** 2026-10-06 · **Status:** ✔
**Objective:** Stage 7 Cell 3: new-project bootstrap — confined writer, templates, apply plan, install manifest v1 write, Prompt Builder contract detection and first planned cell, CLI new with dry-run
**Boundary:** in: tools/bootstrap writer/apply/templates/install-manifest/compose/cli + bootstrap/templates + package.json bootstrap script + gates-deps expectation | NOT in: existing-project audit, hooks activation logic beyond plan, uninstall, drift
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** new flow end-to-end on temp targets incl. dry-run no-write proof; trilateral + verify:final green
**Last fact:** New-project flow: writer (confined, exclusive create, managed blocks), templates (agents-md, agents-block, claude-pointer, verification-contract, gitignore-block), install-manifest v1 (validated, publication-checked, basename target), apply (confirm + per-action approval ids agents-block/gitignore-block/hooks/first-cell/ci-workflow; manifest written last; state refreshed after first cell), compose-builder (Builder CLI subprocess, exit codes only), new-flow + CLI (npm run bootstrap; dry-run zero writes proven by tree hash). Hooks activation and CI file still recorded as proposed (Cell 5). +95 tests; mutation on approval gate went red then restored.
**Build/typecheck:** trilateral green: typecheck 0 errors, 249 modules load, tests 1301/1301; gates clean
**Decisions:** BS4: no gate relaxation; Bootstrap reaches the Prompt Builder only via its CLI subprocess (exit codes); tools/gates unchanged. New target may hold AGENTS.md/CLAUDE.md (block with approval). cellmode cmdPlan writes the planned cell (reuse, documented).
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
