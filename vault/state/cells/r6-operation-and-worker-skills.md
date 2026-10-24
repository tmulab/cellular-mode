# Cell: R6 operation and worker skills
**ID:** r6-operation-and-worker-skills
**Area:** skills
**Opened:** 2026-10-24 · **Status:** 🔵
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Procedures for the operation layer: cell and pause revised, new operation and worker skills. Conflicts named: bootstrap catalog belongs to R10b (report, do not register); skills/verify belongs to R9
**Boundary:** in: skills/cell/SKILL.md, skills/pause/SKILL.md, new skills/operation/SKILL.md, new skills/worker/SKILL.md, .claude/skills pointers, adapters/** | NOT in: skills/verify, tools/bootstrap/**, AGENTS.md, tools/cellmode/**, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** cell/pause cover opening inside an operation and pausing by name; operation and worker skills written within their budgets; every test that cites skills stays green without assertion changes
**Last fact:** —
**Build/typecheck:** —
**Decisions:** —
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
List the tests that read skill texts and what each pins
