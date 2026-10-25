# Cell: AGENTS template v2
**ID:** agents-template-v2
**Area:** bootstrap
**Opened:** 2026-10-25 · **Status:** ✔
**Objective:** Generated AGENTS.md and the managed AGENTS block carry the v2 rules, so new installs stop receiving the v1 rules (found in R11)
**Boundary:** in: bootstrap/templates/agents-md.md, bootstrap/templates/agents-block.md, and tests that pin their text only if they assert v1 wording | NOT in: tools/bootstrap code, upgrade behaviour for already-generated files, AGENTS.md of this repo, any real repository
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** both templates carry the v2 seven rules (operation, parallel cells, pack, frozen finish line, data-aware light gate, generated panel) and the two new approval items; rendered AGENTS.md stays within the 55-line budget if one applies; node --test green; verify:final green
**Last fact:** bootstrap/templates/agents-md.md (68 lines) now renders the v2 rules 1–6, operations/ in state, the operation and worker skills in the entry points and the two new approval items; rule 7 kept generic (pinned by the pause tests). agents-block.md (13 lines) points to operations and the operation skill. Verified by a fresh bootstrap new --profile minimal in a temp folder: 70-line AGENTS.md with the v2 rules, no unfilled placeholder, operation and worker skills installed. Parked: a test pinning the template rules to this repository's AGENTS.md.
**Build/typecheck:** green (node --test 1604 pass / 0 fail / 0 skipped; verify:final next)
**Decisions:** Already-generated AGENTS.md files are not re-rendered by upgrade; adopters edit by hand
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
