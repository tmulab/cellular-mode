# Cell: v1-release-alignment
**ID:** v1-release-alignment
**Area:** release
**Opened:** 2026-10-08 · **Status:** ✔
**Objective:** Align the public repository with Cellular Mode v1.0.0: package version, README status, SECURITY wording, RELEASE_CHECKLIST reconciliation, release boundary, minimal CHANGELOG; no behaviour change
**Boundary:** in: package.json version, README.md, SECURITY.md, RELEASE_CHECKLIST.md, CHANGELOG.md (new, minimal), metadata tests only | NOT in: runtime behaviour, gates, tags, releases, npm, repo settings
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** documents state v1.0.0 accurately with final CI evidence; tests asserting metadata updated; rehearsals x3 + verify:final green
**Last fact:** Release identity Cellular Mode v1.0.0: package.json and package-lock.json version 1.0.0 (private true kept, no npm publication). README status rewritten with final CI 37771618776 on 45c69dd (1477 passed, 0 failed, 1 skipped Windows-only H7 test on Linux; 287 modules; gates and release gate clean; trailer and fingerprint MATCH; UPP 11/11 in-process, node, python, java, rust; C++ UNEXECUTED); EIP stated as not required; three domains kept. SECURITY: v1.0.0 released, experimental runtime surfaces keep their documented scope, no API freeze for experimental EIP/UPP, no fixed response-time commitment. RELEASE_CHECKLIST reconciled (public, no tag, no release, branch protection not enabled, stage commits done; historical failed CI and UNKNOWNs kept). CHANGELOG.md added (minimal 1.0.0 entry with release boundary, adoption-evidence limitation, historical UNKNOWNs). No test needed updating.
**Build/typecheck:** docs tests 17/17, pause-triggers 8/8, gates-deps 10/10; check-all release clean; trilateral 1478/1478
**Decisions:** Minimal CHANGELOG added; lockfile version edited in place (two fields) rather than via npm install.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
