# Cell log

APPEND-ONLY — never edit or reorder past entries. Newest entry last.
This file is the single source of truth; INDEX.md, CURRENT-CELL.md and
cells/*.md are projections of it. Planned (📋) cells have no entry: they
never ran, and inventing one would be fiction in an append-only record.

---
## 2026-03-02 09:40 · Cell: Word count
**Status:** ✔
**Facts:** Added countWords() to examples/text-stats/src/text-stats.mjs; 5 criteria in examples/text-stats/test/word-count.test.mjs, all green.
**Decisions:** Split on \p{White_Space} (+ BOM), not on /\s/: the ideographic space must separate words. Punctuation stays glued to its word. A non-string throws TypeError instead of returning 0.
**Build:** green
**Next step:** —

---
## 2026-03-03 08:35 · Cell: Reading time
**Status:** ⏸
**Facts:** Wrote examples/text-stats/contracts/reading-time.md (question, pre-committed decisions, expected input/minutes table, C1-C4) and examples/text-stats/test/reading-time.test.mjs. readingTime() is not implemented yet in src/text-stats.mjs.
**Decisions:** Round up with Math.ceil (a started minute is a whole minute); 0 words = 0 minutes, not 1; wpm default 200.
**Build:** red (TypeError: readingTime is not a function)
**Next step:** run `node --test "examples/text-stats/test/reading-time.test.mjs"` and read the first error
**Personal note (optional):** Stopping with the tests already red is the cheapest bookmark there is.

---
## 2026-03-04 08:25 · Cell: Reading time
**Status:** ✔
**Facts:** Implemented readingTime() in examples/text-stats/src/text-stats.mjs; C1-C4 green in examples/text-stats/test/reading-time.test.mjs; each criterion proved red by one mutation, recorded in the contract verdict.
**Decisions:** Kept the parked CJK idea out of scope: words-per-minute is the declared boundary of this cell.
**Build:** green
**Next step:** —
