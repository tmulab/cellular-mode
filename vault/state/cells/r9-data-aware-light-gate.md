# Cell: R9 data-aware light gate
**ID:** r9-data-aware-light-gate
**Area:** gates
**Opened:** 2026-10-24 · **Status:** 🔵
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Rule 4 made verifiable: example light gate maps data files to the tests that read them; skills/verify and docs/05 state the minimum of a partial gate. Conflicts named by the orchestrator: none (sole owner of skills/verify and docs/05)
**Boundary:** in: skills/verify/SKILL.md, docs/05-engineering-rules.md, new examples/gates/** | NOT in: tools/gates/**, package.json, tools/cellmode/**, vault/**, every other cell's files
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** a test proves a JSON that breaks a test turns the example light gate red; skills/verify and docs/05 updated within 200 lines; node --test green
**Last fact:** —
**Build/typecheck:** —
**Decisions:** —
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
Read tools/gates/README.md and rule 4 in AGENTS.md, write the criterion for 'a test that reads a data file' before coding
