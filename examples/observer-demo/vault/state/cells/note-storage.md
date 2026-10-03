# Cell: Note storage
**ID:** note-storage
**Area:** src/storage.mjs
**Opened:** 2026-04-06 · **Status:** ✔
**Objective:** Save and load notes as files, one note per file.
**Boundary:** in: saveNote()/loadNote() in src/storage.mjs | NOT in: search, tags, synchronisation, a database
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** a saved note loads back byte-identical
**Last fact:** saveNote() and loadNote() implemented; 6 criteria green.
**Build/typecheck:** green
**Decisions:** One file per note, named by id: a single file would turn every write into a rewrite of the whole library.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
