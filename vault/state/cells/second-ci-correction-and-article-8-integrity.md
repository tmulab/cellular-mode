# Cell: Second CI correction and Article 8 integrity
**ID:** second-ci-correction-and-article-8-integrity
**Area:** eip/host/repo-read-port.test.mjs, tools/adaptive policy loading, tools/gates verify-final byte equivalence
**Opened:** 2026-10-04 · **Status:** ✔
**Objective:** Fix the two Linux-only failures and make Article 8 refuse when tested bytes differ from the bytes Git will commit
**Boundary:** in: portable A20 paths, canonical LF policy bytes and measurements, working-tree vs commit-blob equivalence check that fails closed, regression tests, restoring the 16 drifted working-copy files from the index | NOT in: repository-wide line-ending conversion, Stage 6, weakening any check
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** suite green on Node 22 and 24 with zero drift; final verification authorized; pushed; remote CI observed
**Last fact:** CI run 37188606487 causes fixed: A20 built a path with a hard-coded backslash (now node:path, plus a refusal assertion for backslash requests); policy bytes measured on CRLF working copies (loader now canonicalises CRLF to LF only, README records the canonical 1971/1954/1869); Article 8 integrity: verify:final first compares the blob of the raw working bytes with the blob Git will commit for every controlled file and fails closed before the suite on any difference, evidence records equivalent and drifted, authorization requires equivalent true (older records stay readable but do not authorize); 15 drifted working copies restored from their index blobs, no blob changed; 13 new tests, 5 mutations red; Node 24.19 and Node 22.13 both 1028/1028 with 0 cancelled; Linux INFERRED until the remote run
**Build/typecheck:** green
**Decisions:** verification evaluates the bytes Git will commit; a clean-worktree verification was assessed and documented, not chosen
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
