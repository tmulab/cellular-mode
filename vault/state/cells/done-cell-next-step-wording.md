# Cell: Done-cell next step wording
**ID:** done-cell-next-step-wording
**Area:** eip/plugins/observer-state views, apps/observer view-model
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Show an intentionally empty next step as None, distinct from missing information
**Boundary:** in: API value for the protocol dash, UI rendering, regression tests | NOT in: any other UI change, push
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** regression tests red before and green after; release gate green; local commit
**Last fact:** observer-state reports nextStepState recorded|none|not-recorded (O19): a completed cell's protocol dash and completion log events are none, planned and active/paused dashes stay not-recorded, done cells no longer list nextStep as unavailable; UI shows None — cell completed as a recorded value (D21, apps/observer/view/fields.mjs); 5 backend tests red before, 10/10 green after, 3 mutations red; verified live via API and a headless screenshot; 514/514 tests, gates and release gate green; prepared for the authorized local commit that follows this entry
**Build/typecheck:** green
**Decisions:** intentional absence and missing information are distinct values in the API contract, not only in the UI wording
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
