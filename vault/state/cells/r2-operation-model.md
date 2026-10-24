# Cell: R2 operation model
**ID:** r2-operation-model
**Area:** tools-cellmode
**Opened:** 2026-10-24 · **Status:** ✔
**Objective:** Data model for the operation layer: parse/serialize operations/<slug>.md with the closed-vocabulary authorization pack, and the Operation/Base commit/Spend fields on cells (plan v2 cell R2); no CLI commands, no check rules
**Boundary:** in: new tools/cellmode/operation-file.mjs (<=200 lines) and its test, tools/cellmode/types.mjs, tools/cellmode/fields.mjs, tools/cellmode/skeleton.mjs, tools/cellmode/cell-file.mjs (new optional fields only), tools/cellmode/README.md (one section) | NOT in: commands.mjs, transitions.mjs, check.mjs, main.mjs, state.mjs behaviour, skills/*, apps/observer, eip/*, docs/*, vault/state of other projects
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** r1-rules-and-lifecycle-v2
**Done criterion (binary):** operation file round-trips parse->serialize->parse without loss; pack parser accepts only spend ceiling, publisher, batches with limits, requires-yes, denied list, max-active-cells and rejects anything else with a named error; a cell file without Operation/Base commit/Spend still parses byte-identically; every touched file <= 200 lines; node --test green with real counts; verify:final green
**Last fact:** Plan v2 cell R2: tools/cellmode/operation-file.mjs (200 lines) parses/renders operations/<slug>.md — Opened, Status, Finish line (frozen) + Fingerprint, Authorization pack, Quality bar, Planned cells, Spend so far — with the closed pack vocabulary PACK_GRANTS (spend ceiling, publisher, batches with limits, requires-yes, denied, max-active-cells), the deny-list PACK_FORBIDDEN_GRANTS checked first, named errors PACK_FORBIDDEN_GRANT / PACK_UNKNOWN_GRANT / PACK_BATCH_WITHOUT_LIMIT, and fingerprintFinishLine (normalize, sort, sha256). cell-file.mjs (118) and types.mjs (82) gained optional Operation/Base commit/Spend; old cell files render byte-identically (tested). README.md (169) documents the model and that no command uses it yet. operation-file.test.mjs: 10 tests. Parked: init + templates for operations/README.md (R3).
**Build/typecheck:** green (typecheck clean; node --test 1488 pass / 0 fail / 0 skipped; npm run gates clean; verify:final runs next as the last action before commit)
**Decisions:** Reuse fields.mjs parseFields; fingerprint normalization drops numbering/whitespace/case and sorts; empty new fields render nothing; deny-list named in code
**Open issues:** skeleton.mjs unchanged — init cannot create operations/README.md without templates/vault/state/operations/README.md, which is outside this boundary (parked for R3); operation-file.mjs sits exactly at the 200-line limit, any addition must split the module
**Minimal context (≤5 lines):** pure data model only, no CLI command reads or writes operation files yet (PROPOSED R3–R5); public surface listed in tools/cellmode/README.md; depends on R1 (ab1fa0e)

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
