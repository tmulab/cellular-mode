# Cell: hardening-test-isolation
**ID:** hardening-test-isolation
**Area:** stage-8
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Stage 8 Cell 4: no installed Cellular Mode file is discoverable by host test runners (A-14/B-05, H4)
**Boundary:** in: tools/gates test-counts module rename + imports, bootstrap/components/article-8.json, gate-level discovery test over profile file sets, real node --test before/after regression | NOT in: anything else
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** target node --test count unchanged after install; discovery test green; trilateral green
**Last fact:** H4: tools/gates/test-counts.mjs renamed count-tests.mjs (content unchanged; references updated in gates, article-8.json, tests, docs). bootstrap-discovery.test.mjs asserts no installed path in any profile matches Node default test patterns or obvious pytest/cargo/Maven/Gradle/Go conventions (mutation red then restored). Real regression: target node --test 3 before, 3 after install (old name: 4).
**Build/typecheck:** trilateral typecheck 0 errors, 279 modules, tests 1446/1446; gates release clean
**Decisions:** Layout change preferred over target-side ignores.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
