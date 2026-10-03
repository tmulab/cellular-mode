# Cell: Markdown parser
**ID:** markdown-parser
**Area:** src/parser.mjs
**Opened:** 2026-04-07 · **Status:** ⏸
**Objective:** Turn a stored note into a heading/paragraph/list tree.
**Boundary:** in: — | NOT in: —
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** note-storage
**Done criterion (binary):** —
**Last fact:** Headings and paragraphs parse; lists are not implemented yet.
**Build/typecheck:** red (3 list criteria failing)
**Decisions:** A linear line scan, not a regex over the whole document: two clever regexes once dropped rows in silence.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
run the parser test file and read the first list failure
