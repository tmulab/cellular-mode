# Cell: Word count
**ID:** word-count
**Area:** examples/text-stats/src/text-stats.mjs
**Opened:** 2026-03-02 · **Status:** ✔
**Objective:** Count the words in a string, Unicode whitespace included.
**Boundary:** in: countWords() in src/text-stats.mjs + test/word-count.test.mjs | NOT in: reading time, sentence count, language detection, a CLI
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** node --test green + a non-breaking space separates two words
**Last fact:** Added countWords() to examples/text-stats/src/text-stats.mjs; 5 criteria in examples/text-stats/test/word-count.test.mjs, all green.
**Build/typecheck:** green
**Decisions:** Split on \p{White_Space} (+ BOM), not on /\s/: the ideographic space must separate words. Punctuation stays glued to its word. A non-string throws TypeError instead of returning 0.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
