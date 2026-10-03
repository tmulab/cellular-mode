# Cell log

APPEND-ONLY — never edit or reorder past entries. Newest entry last.
This file is the single source of truth; INDEX.md, CURRENT-CELL.md and
cells/*.md are projections of it. Planned (📋) cells have no entry: they
never ran, and inventing one would be fiction in an append-only record.

---
## 2026-04-06 10:20 · Cell: Note storage
**Status:** ✔
**Facts:** saveNote() and loadNote() implemented; 6 criteria green.
**Decisions:** One file per note, named by id: a single file would turn every write into a rewrite of the whole library.
**Build:** green
**Next step:** —

---
## 2026-04-07 09:30 · Cell: Markdown parser
**Status:** ⏸
**Facts:** Headings and paragraphs parse; lists are not implemented yet.
**Decisions:** A linear line scan, not a regex over the whole document: two clever regexes once dropped rows in silence.
**Build:** red (3 list criteria failing)
**Next step:** run the parser test file and read the first list failure
**Personal note (optional):** Stopping with the tests already red is the cheapest bookmark there is.
