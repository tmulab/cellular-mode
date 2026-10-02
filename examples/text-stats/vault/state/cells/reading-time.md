# Cell: Reading time
**ID:** reading-time
**Area:** examples/text-stats/src/text-stats.mjs
**Opened:** 2026-03-03 · **Status:** ✔
**Objective:** Turn a word count into minutes of reading, rounded up.
**Boundary:** in: readingTime() in src/text-stats.mjs + contracts/reading-time.md | NOT in: CJK character counting, sentence splitting, HTML stripping
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** node --test green + the input/minutes table in the contract matches
**Last fact:** Implemented readingTime() in examples/text-stats/src/text-stats.mjs; C1-C4 green in examples/text-stats/test/reading-time.test.mjs; each criterion proved red by one mutation, recorded in the contract verdict.
**Build/typecheck:** green
**Decisions:** Kept the parked CJK idea out of scope: words-per-minute is the declared boundary of this cell.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
