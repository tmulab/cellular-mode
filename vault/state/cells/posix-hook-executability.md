# Cell: posix-hook-executability
**ID:** posix-hook-executability
**Area:** stage-7
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Corrective cell for CI run 37614832141: make Bootstrap-installed .githooks executable on POSIX and mark this repository's three hooks executable in the git index; regression tests; doc limitation corrected
**Boundary:** in: tools/bootstrap writer/copy path for hooks, regression tests, .githooks index modes, docs/12 + BOOTSTRAP_REPORT limitation wording | NOT in: any other Stage 7 change, schema redesign, new hook framework
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** hooks executable in targets (POSIX) and in index (100755); e2e Article 8 test strengthened; final verification + 3 rehearsals green; commit, push, CI green
**Last fact:** Demonstrated: .githooks/* were 100644 in the git index and the bootstrap writer never set a file mode, consistent with CI run 37614832141 (Linux git ignores non-executable hooks; commit returned 0). Fix: narrow documented rule copyMode (writer.mjs) - article-8 copies under .githooks/ written 0o755 (chmod after exclusive create, confinement first); other copies keep default mode; content hashes, status and uninstall unaffected. Repo hooks marked +x in the index (100755). Tests: e2e Article 8 asserts executable hooks on POSIX (sequence unchanged, still runs on Windows), writer unit test for hook vs plain file, tests/githooks-mode.test.mjs asserts 100755. Docs: docs/12, BOOTSTRAP_REPORT (limitation corrected, historical note of the CI discovery), FINAL-VERIFICATION, hook limitation message.
**Build/typecheck:** focused: bootstrap 191/191, docs+hooks 15/15; trilateral typecheck 0 errors, 279 modules, tests 1428/1428; gates release no blockers
**Decisions:** Narrow .githooks rule instead of a schema change (no file-metadata mechanism exists). POSIX behaviour INFERRED locally (Windows), to be VERIFIED by Linux CI.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
