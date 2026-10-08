# Cell: citation-cff
**ID:** citation-cff
**Area:** release
**Opened:** 2026-10-08 · **Status:** ✔
**Objective:** Add post-release CITATION.cff (Zenodo DOI) to main; v1.0.0 tag and GitHub Release untouched
**Boundary:** in: CITATION.cff at repository root | NOT in: tag, release, version, npm, Zenodo, any other file
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** file byte-exact as provided; gates and suite green; verify:final
**Last fact:** Added CITATION.cff at the repository root for the published v1.0.0 release (DOI 10.5281/zenodo.23239314, commit field 1070dcd as provided); validated with cffconvert 2.0.0: valid according to schema version 1.2.0. No release functionality, tag, GitHub Release, version or npm change.
**Build/typecheck:** cffconvert validate exit 0; gates release clean; docs/leaks tests 17/17
**Decisions:** Metadata as provided by the human, already validated externally; commit field kept.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
