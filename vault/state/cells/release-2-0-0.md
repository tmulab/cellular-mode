# Cell: Release 2.0.0
**ID:** release-2-0-0
**Area:** release
**Opened:** 2026-10-25 · **Status:** ✔
**Objective:** Prepare the 2.0.0 release of the software (the v2 method): version, CHANGELOG, citation metadata, release notes, release gates green; show everything to the human before commit, tag and GitHub release
**Boundary:** in: package.json and lock version fields, CHANGELOG.md, CITATION.cff, README.md status and version lines, RELEASE_CHECKLIST.md, docs/PUBLISHED-ARTIFACTS.md, release notes draft outside the repo, files the v1.0.0 alignment commit touched | NOT in: tag creation, git push of the tag, GitHub release publication and Zenodo deposit before the human yes; code changes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** version 2.0.0 everywhere the v1 alignment set 1.0.0; CHANGELOG has a 2.0.0 section; CITATION.cff version and date; release notes drafted; release gates and verify:final green; human approves before tag and release
**Last fact:** Release 2.0.0 prepared and approved by the human: package.json and lock 2.0.0; openapi info 1.1.0; CHANGELOG 2.0.0 section; CITATION.cff 2.0.0 with the concept DOI (abstract kept as is, by the human's choice); README, SECURITY, RELEASE_CHECKLIST, docs/PUBLISHED-ARTIFACTS updated; release notes drafted outside the repo. Two wrong claims fixed before approval (upgrade syntax; CI per push).
**Build/typecheck:** green (typecheck 0 errors; node --test 1604/1604; gates clean; release gate no blockers; verify:final next)
**Decisions:** Version 2.0.0 because rule 1 changed in kind; plugin manifest versions unchanged (own contracts); version DOI and release hash added to CITATION.cff after the Zenodo deposit
**Open issues:** CITATION.cff abstract still describes v1 scope (author voice, human to decide); whether the GitHub release auto-creates a Zenodo version is UNKNOWN (v1 record supplements the v1.0.0 tag); version DOI and release hash go into CITATION.cff after deposit
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
