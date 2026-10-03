# Cell: Explicit pause triggers
**ID:** explicit-pause-triggers
**Area:** skills/pause, adapters pause/pausar, AGENTS.md rule 7, docs, ADR 0004
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Pause only on explicit requests; a declared fatigue may only prompt an offer; record ADR 0004 approval
**Boundary:** in: pause skill triggers and body, Claude adapters, AGENTS rule 7, docs mentions, hygiene tests | NOT in: adaptive mode logic, behavioral validation
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** no inference-based pause trigger remains anywhere; tests red before and green after; release gate green
**Last fact:** pause triggers are explicit only (skills/pause, Claude pause/pausar pointers byte-identical, AGENTS.md rule 7): a declared fatigue gets one offer, never an automatic pause or a mode change; history note in MIGRATION_REPORT; ADR 0004 recorded as approved by the author; tests/pause-triggers.test.mjs red before, 3 mutations red; 710/710 tests, gates and release gate green; the live harness reloaded the new descriptions
**Build/typecheck:** green
**Decisions:** only an explicit mode command changes the adaptive mode; the original any-sign-of-tiredness trigger is removed by the author's decision
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
