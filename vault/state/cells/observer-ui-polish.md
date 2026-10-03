# Cell: Observer UI polish
**ID:** observer-ui-polish
**Area:** apps/observer (graph view, advisor area)
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Better initial 2D framing and label readability; neutral disabled Advisor state without the NOT_FOUND diagnostic
**Boundary:** in: initial fit, label sizing, advisor disabled state, regression tests, headless screenshots | NOT in: API contracts, dependencies, other UI changes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** regression tests red before and green after; screenshots at tall and normal windows; release gate green
**Last fact:** 2D framing: initial view equals fit (pure apps/observer/view/fit-2d.mjs), labels 4 px -> 12 px at 1280x900/1500/2000 and 1.3 -> 11.9 px at 320 px, panel aspect-clamped, zoom/pan/fit/selection re-verified headless; root cause was server spacing scaled by preserveAspectRatio, and fit was a no-op; disabled Advisor: no probe and no NOT_FOUND box when the host does not list the plugin, own neutral state disabled (lead fix: first pass still used the alerting colour), real failures keep their error; D22/D23 red before green, 7 mutations red; 535/535 tests, gates and release gate green; no API or dependency change; prepared for the authorized commit and private push that follow this entry
**Build/typecheck:** green
**Decisions:** node glyphs stay ~6 px at fitted scale to keep the 500-cell texture (recorded in MANUAL-CHECKS)
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
