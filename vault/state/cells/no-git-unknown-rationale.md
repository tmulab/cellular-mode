# Cell: No-git UNKNOWN rationale
**ID:** no-git-unknown-rationale
**Area:** method-docs
**Opened:** 2026-10-24 · **Status:** ✔
**Objective:** Document why cellmode check may exit 0 with an UNKNOWN notice when git is absent (human decision 2026-10-24)
**Boundary:** in: docs/00-constitution.md (Article 3 fail-closed bullet), tools/cellmode/README.md (the UNKNOWN paragraph) | NOT in: any code, tests, other docs, vault of other projects
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** both texts state the rule and why it is safe (Article 8 needs git, so no completion is verified without it); both files <= 200 lines; node --test green; verify:final green
**Last fact:** docs/00-constitution.md Article 3 (200 lines): the gate-that-cannot-run bullet names the one bounded case — cellmode check without git prints an UNKNOWN notice for cell-stale and merge-unrecorded and exits 0, because Article 8 needs git and nothing is verified there. tools/cellmode/README.md (200 lines): the UNKNOWN paragraph states the same reason and the decision; one one-word line joined to stay within 200. The parking-lot line asking for this decision is resolved by a new line (append-only).
**Build/typecheck:** green (typecheck clean; node --test 1599 pass / 0 fail / 0 skipped; gates clean; verify:final next)
**Decisions:** Human kept the no-git rule on 2026-10-24: UNKNOWN notice and exit 0 without git; with git, an unknown Base commit stays a finding
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
