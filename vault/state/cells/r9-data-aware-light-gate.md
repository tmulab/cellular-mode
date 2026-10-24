# Cell: R9 data-aware light gate
**ID:** r9-data-aware-light-gate
**Area:** gates
**Opened:** 2026-10-24 · **Status:** ✔
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Rule 4 made verifiable: example light gate maps data files to the tests that read them; skills/verify and docs/05 state the minimum of a partial gate. Conflicts named by the orchestrator: none (sole owner of skills/verify and docs/05)
**Boundary:** in: skills/verify/SKILL.md, docs/05-engineering-rules.md, new examples/gates/** | NOT in: tools/gates/**, package.json, tools/cellmode/**, vault/**, every other cell's files
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** a test proves a JSON that breaks a test turns the example light gate red; skills/verify and docs/05 updated within 200 lines; node --test green
**Last fact:** Example light gate examples/gates/related-with-data.mjs (189) maps staged data files to the tests that read them (path-suffix literal at a segment boundary, every reference kind selects, guard folder always runs); 6 tests prove a JSON that breaks a test turns the gate red while the related-only control stays green; skills/verify (132) gains 'A partial gate has a floor'; docs/05 (200) cites rule 4. Found and fixed a false green: the nested runner inherited NODE_TEST_CONTEXT and exited 0 without running. Integrated from a worker worktree, byte-identical copy.
**Build/typecheck:** green on main after integration (typecheck clean; node --test 1537 pass / 0 fail / 0 skipped; gates clean; verify:final runs next)
**Decisions:** a test reads a data file when its source holds a literal that is a path-suffix of the data file at a segment boundary; all reference kinds select the test (fail open); guard folder always runs; NODE_TEST_CONTEXT is removed before spawning (it made the nested runner exit 0 without running, a false green)
**Open issues:** worker worktree base was 8323c20, not main; boundary files identical on both, so no drift
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
