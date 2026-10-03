# Cell: Adaptive observer integration
**ID:** adaptive-observer-integration
**Area:** eip/plugins/adaptive-preferences, eip/host composition, apps/observer presentation
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Let the Observer read the declared mode through an optional read-only plugin and adapt presentation only
**Boundary:** in: read-only plugin and port, optional composition flag, presentation rules, tests | NOT in: a mode selector, any write, any change when adaptive is absent
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** observer unchanged without the plugin; security findings never hidden under any mode; release gate green
**Last fact:** adaptive.preferences read-only plugin (no inject) via path-confined adaptive read port (two names only), loaded only with the observer --adaptive flag; named ADAPTIVE_PURE_IMPORTS allowlist; UI badge and presentation rules per mode; invariant: FAIL and security findings always shown in full (WARNING also always shown after the headless check caught a cap); flag off leaves the Observer unchanged; 7 mutations red; headless screenshots checked by the lead; 702/702 tests, gates and release gate green
**Build/typecheck:** green
**Decisions:** no mode selector in the dashboard (writes out of scope, future work); the cap of 3 is a human-review item
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
