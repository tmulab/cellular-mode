# Cell: prompt-builder-prompts
**ID:** prompt-builder-prompts
**Area:** stage-6
**Opened:** 2026-10-04 · **Status:** ✔
**Objective:** Stage 6 Cell 5: three-layer agent-neutral prompt generation, injection-safe, plus adapter registry with neutral and claude-code adapters
**Boundary:** in: tools/prompt-builder prompt/adapters modules + tests | NOT in: CLI, skills, adaptive, multi-model
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** prompt modules tested incl. injection + context budget; trilateral + verify:final green
**Last fact:** Prompt modules: prompt-data (hash-nonce DATA block + marker neutralization), prompt-rules, prompt-layers, prompt (renderPrompt, budget 6000B, fail-closed UNSAFE_EXPORT), adapters (neutral + claude-code implemented; cursor/codex-cli/gemini-cli proposed, throw). Sizes: simple-new 4620/4509B, complex 5324/5213B; method layer 930/819B. +24 tests; mutation on marker neutralization went red then restored.
**Build/typecheck:** trilateral green: typecheck 0 errors, 212 modules load, tests 1184/1184; gates clean
**Decisions:** All human/repo text lives only inside one DATA block; instruction sections reference keys, never interpolate, so contract text cannot add permissions. Prohibited operations fixed regardless of contract. Draft prompts allowed only with explicit draft flag and limited to discovery. draft.proposals not exported (only contract-level PROPOSED).
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
