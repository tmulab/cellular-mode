# Cell: prompt-builder-discovery
**ID:** prompt-builder-discovery
**Area:** stage-6
**Opened:** 2026-10-04 · **Status:** ✔
**Objective:** Stage 6 Cell 2: progressive discovery (draft store, question bank, answers incl. I-don't-know, existing-project inspection, resume routing) per prompt-builder/CONTRACTS.md
**Boundary:** in: tools/prompt-builder discovery/store/inspect modules + tests + fixtures | NOT in: contract approval, first cell, prompts, CLI, skills
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** pure discovery modules tested; trilateral + verify:final green
**Last fact:** Discovery modules in tools/prompt-builder (types, errors, contract-shape, fields, draft, questions, sensitive, answers, inspect, store, session) + fixtures (10 scenarios) + 51 tests. .gitignore += vault/builder/. readCellState reuses cellmode parseIndex+statePaths (no second parser). Real mutation check on tired-mode concision went red then restored.
**Build/typecheck:** trilateral green: typecheck 0 errors, 196 modules load, tests 1080/1080; gates size/secrets/deps/boundaries clean
**Decisions:** Single-Entry recommendations live in draft.proposals; list fields get PROPOSED appended. technologies.approved accepts VERIFIED (existing-repo evidence) — CONTRACTS.md amended. sensitive.mjs builds detectors from fragments so no literal secrets/paths in repo.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
