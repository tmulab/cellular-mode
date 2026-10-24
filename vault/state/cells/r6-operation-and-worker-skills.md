# Cell: R6 operation and worker skills
**ID:** r6-operation-and-worker-skills
**Area:** skills
**Opened:** 2026-10-24 · **Status:** ✔
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Procedures for the operation layer: cell and pause revised, new operation and worker skills. Conflicts named: bootstrap catalog belongs to R10b (report, do not register); skills/verify belongs to R9
**Boundary:** in: skills/cell/SKILL.md, skills/pause/SKILL.md, new skills/operation/SKILL.md, new skills/worker/SKILL.md, .claude/skills pointers, adapters/** | NOT in: skills/verify, tools/bootstrap/**, AGENTS.md, tools/cellmode/**, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** cell/pause cover opening inside an operation and pausing by name; operation and worker skills written within their budgets; every test that cites skills stays green without assertion changes
**Last fact:** skills/cell (120, cap 120) and skills/pause (117) cover cells inside an operation, naming conflicts, ceiling, amendments, pause by name, op pause refusing; new skills/operation (100) and skills/worker (67) with pointers in .claude/skills and adapters/claude-code; worker forbids permission laundering and never touches the vault. Orchestrator registered both in bootstrap/components/method-core.json (componentVersion 1.1.0) and the POINTERS list of tools/bootstrap/apply-generate.mjs (116), as R10b indicated, so upgrade carries them to adopters. Integrated from a worker worktree.
**Build/typecheck:** green on main after integration (typecheck clean; node --test 1537 pass / 0 fail / 0 skipped; gates clean; verify:final runs next)
**Decisions:** One commit for R9, R10b and R6: verify:final signs the whole tree, and splitting would require reverting files between commits, which the operation denies
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
