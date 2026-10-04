# Cell: Verification fragility fixes
**ID:** verification-fragility-fixes
**Area:** apps/observer/tests/proxy.test.mjs, eip/upp-host/toolchains.mjs
**Opened:** 2026-10-03 · **Status:** ✔
**Objective:** Make the mandatory suite deterministic under the heavier Stage 5 load
**Boundary:** in: proxy test deadlines, toolchain probe retry, probe tests | NOT in: any behavior change outside tests and probing
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** final verification passes on the state that contains these fixes
**Last fact:** Article 8 refused cell 4: its first final verification FAILED (3 observer proxy tests got 504 because one 300 ms deadline was shared by every case under load; python skipped because the WindowsApps alias printed nothing under load), although the cell had reported 914/914; fixes: ordinary proxy cases use a 10 s deadline and the timeout case its own 300 ms server (asserting the short deadline fired); probe retries only exit-0-with-no-output at most twice, with 3 new tests proving a real silence or a non-zero exit is still reported (mutation red)
**Build/typecheck:** green
**Decisions:** a cell's own green run is not authorization; only verify:final on the final state is
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
