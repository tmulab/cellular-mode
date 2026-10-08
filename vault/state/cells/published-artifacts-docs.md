# Cell: published-artifacts-docs
**ID:** published-artifacts-docs
**Area:** release
**Opened:** 2026-10-08 · **Status:** ✔
**Objective:** Documentation-only post-release update: link the five published v1.0.0 records (software, two preprints, two user guides), correct stale current-state release claims, keep tag v1.0.0 on 1070dcd
**Boundary:** in: README.md, CHANGELOG.md, docs/PUBLISHED-ARTIFACTS.md (new), RELEASE_CHECKLIST.md header current-state lines only | NOT in: runtime, version, tag, GitHub Release, CITATION.cff, Zenodo, historical reports
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** docs accurate; CITATION.cff validated; gates, docs tests and verify:final green; no commit
**Last fact:** Documentation-only post-release update: README status now cites the final release evidence (release commit 1070dcd, CI 37777098948; 1477 passed, 0 failed, 1 Windows-only skip; tag v1.0.0 stays on 1070dcd, main carries later documentation commits), new Published artifacts table (software, two preprints, two user guides as DOI links), documentation links, Citation subsection; CHANGELOG post-release documentation section and historical note replacing the false no-tag/no-release clause; RELEASE_CHECKLIST header current state corrected (tag and Release published, release commit vs Stage 8 commit evidence separated); new docs/PUBLISHED-ARTIFACTS.md (version and concept DOIs, relations, map). CITATION.cff unchanged and valid (cffconvert, schema 1.2.0). Historical sections and reports preserved.
**Build/typecheck:** docs tests 25/25; check-all release clean; cffconvert valid
**Decisions:** Stage 8 commit 45c69dd and CI 37771618776 kept only as labelled history; policy/relaxations.md 'not release-ready' preserved (gate semantics).
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
