# Cell: Plugins and dev UI
**ID:** plugins-and-dev-ui
**Area:** eip/plugins
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Two real plugins: text.stats (reuses example) and consequential text.report
**Boundary:** in: plugins, devUi, contract tests | NOT in: host, kernel
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** ACCEPTANCE T1-T8 green with mutation verdicts
**Last fact:** eip/plugins/text-stats/{index,dev-ui}.mjs reuse examples/text-stats/src; eip/plugins/text-report/index.mjs (inject text.stats required, fs.write port, consequential save-report); contract+domain tests; mutations T2,T3,T4,T7 red
**Build/typecheck:** green
**Decisions:** contract tests sit in eip/plugins/ root so plugin dirs never import the kernel
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
