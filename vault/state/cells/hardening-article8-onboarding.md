# Cell: hardening-article8-onboarding
**ID:** hardening-article8-onboarding
**Area:** stage-8
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Stage 8 Cell 6: Article 8 without internal JSON (verification CLI), real final-verification command in every remedy message, Windows npm/npx without a shell (A-03/B-06, A-11/B-07/B-08, B-09, H6, H7)
**Boundary:** in: tools/bootstrap verification command + exec resolver, tools/gates verification-suite resolver + remedy texts, tools/cellmode complete message, tests, docs | NOT in: builder, status, other areas
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** user can add/run/approve/make mandatory/revoke checks via CLI; messages name an existing command; npm checks run on Windows without shell or fail with explicit alternative; trilateral green
**Last fact:** H6: verification CLI in Bootstrap (list/add/run/approve/mandatory/revoke; confirm-gated; writer-evolving replaceEvolving limited to vault/verification.json); approval never sets VERIFIED; remedy text everywhere names node tools/gates/verify-final.mjs. H7: npm/npx resolved to Node entry points on win32 without shell, mirrored in tools/gates/verification-suite.mjs and tools/bootstrap/exec-shim.mjs with cross-test tests/verification-shim.test.mjs. E2E: CLI-only add/run/mandatory then verify-final passes and commit accepted. +15 tests. INCIDENT: the coder ran git checkout on docs/12-bootstrap.md and FINAL-VERIFICATION.md, discarding unstaged Stage 8 doc edits; FINAL-VERIFICATION fully restored; docs/12 status section reconstructed; Cell 2+5 doc facts (draft tolerated/ignored, block text shown, uninstall --verbose) lost and to be restored in Cell 8. Code and tests unaffected.
**Build/typecheck:** typecheck 0 errors; tests 1467/1467; gates release clean
**Decisions:** Resolvers mirrored (gates must not import bootstrap) with a cross-test; resolved argv printed, never persisted (machine path). Future delegations forbid git checkout/restore/reset/stash.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
