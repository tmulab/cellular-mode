# Cell: prompt-builder-cli-skills
**ID:** prompt-builder-cli-skills
**Area:** stage-6
**Opened:** 2026-10-04 · **Status:** ✔
**Objective:** Stage 6 Cell 6: Builder CLI (start/status/next/answer/skip/decide/approve/cell/prompt/adapters), skills/builder canonical Skill with /builder + /construtor pointers, optional Adaptive mode pass-through
**Boundary:** in: tools/prompt-builder CLI modules + tests, skills/builder, .claude/skills pointers (root + adapters/claude-code), package.json builder script | NOT in: gate rules, removal rehearsal, docs, report (Cell 7)
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** CLI end-to-end tested on temp roots; skills present; trilateral + verify:final green
**Last fact:** Builder CLI (cli, main, cli-shared EXIT_FOR table, commands, commands-approve) with start/status/next/answer/skip/decide/approve/cell/prompt/adapters/help; skills/builder/SKILL.md + /builder and /construtor pointers in .claude/skills and adapters/claude-code (byte-identical); npm script builder. +16 CLI tests on temp roots; existing-repo files byte-identical; mutation on approve --confirm guard went red then restored. Claude Code discovered builder/construtor skills live in this session.
**Build/typecheck:** trilateral green: typecheck 0 errors, 216 modules load, tests 1200/1200; gates clean
**Decisions:** Exit codes mirror cellmode (1 usage, 2 findings, 3 existing state, 5 confirmation). --mode is pass-through only; CLI never reads Adaptive state. tests/gates-deps.test.mjs expected scripts set extended with builder (exact-match assertion kept).
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
