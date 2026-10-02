# Cell: Hygiene tests and reports
**ID:** hygiene-tests-and-reports
**Area:** tests
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Make the universalization claims machine-checkable
**Boundary:** in: tests/, CONTEXT_AUDIT.md, MIGRATION_REPORT.md | NOT in: six hygiene suites and the two reports
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** npm test green with every suite included
**Last fact:** Added six hygiene suites in tests/ (leaks, language, bootstrap, links, license, size) with a shared walker in tests/helpers.mjs: 24 tests, npm test now 81/81. Fixed the content they caught: LICENSE replaced by the unmodified upstream Apache-2.0 text with the copyright moved into NOTICE, and NOTICE now names the license. Gave the Level 4 policy file one canonical path, vault/policy.md, consistently in AGENTS.md, README.md, docs/04, docs/05, docs/06, docs/07, templates/project-policy.md and templates/handoff.md. Wrote CONTEXT_AUDIT.md (164 lines, measured with wc) and MIGRATION_REPORT.md (200 lines).
**Build/typecheck:** green
**Decisions:** No test was weakened to pass. Two allowlists exist and both are justified in a comment: adapters/README.md is exempt from the 15-line adapter budget because it is documentation, and the files that carry Portuguese trigger phrases verbatim (skills, adapters, .claude, templates/user-profile.md) are exempt from the English heuristic. No token counts are reported anywhere: no tokenizer is available offline, and a guessed ratio would be a fabricated measurement.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
