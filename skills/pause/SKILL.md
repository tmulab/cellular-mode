---
name: pause
description: >
  Close or complete the current Cellular Mode cell, recording state so it can be
  resumed cheaply. Use whenever the human says /pause or /pausar, "I'm tired",
  "stop here", "that's enough for today", "note this down", "I'll continue later",
  "I have to go", "close this cell", "let's call this cell done", or the Portuguese
  equivalents ("cansei", "vou parar", "chega por hoje", "anota aí", "continuo depois",
  "fecha essa célula", "conclui a célula"), or shows signs of fatigue. Use it also
  BEFORE switching to another cell or to a large new subject.
---

# Close a cell (pause or complete)

Closing is the most important act of Cellular Mode: it is what makes coming back cheap.
Do it carefully, in few exchanges.

## Steps

0. **Integrity guard.** Read `INDEX.md`: every ⏸ or ✔ cell must have at least one entry
   in `vault/state/log.md` (📋 planned cells are exempt). If the log holds less than the
   index implies → stop, report "log shrunk" with the difference, reconstruct the missing
   entries from `INDEX.md` + `cells/*.md` marked `[reconstructed]`, and only then append.
1. **Collect the FACTS of the session** — what was actually done, not intentions: files
   touched with exact paths, decisions taken, build/typecheck status.
2. **Append** an entry to `vault/state/log.md`. Append-only: NEVER edit past entries.
   Newest entry last.

   ```
   ---
   ## YYYY-MM-DD HH:MM · Cell: <name>
   **Status:** ⏸ | ✔
   **Facts:** <what was done; files with exact paths>
   **Decisions:** <never to be re-argued without a new fact>
   **Build:** green | red (<one-line error>)
   **Next step:** <same as the cell file; "—" when done>
   **Personal note (optional):** <1 line>
   ```

3. **Write the full projection** into `vault/state/cells/<slug>.md` (same format as
   `CURRENT-CELL.md`, area field included).
4. **Update the cell's row in `vault/state/INDEX.md`:**
   - Normal pause → status ⏸, today's date, next step in one line.
   - Done criterion reached → ask "did we finish this cell?"; if yes → status ✔ and the
     next step becomes "—". Only an explicit human confirmation can produce a ✔.
5. **Rewrite `vault/state/CURRENT-CELL.md`** as: `No active cell · N paused — see
   INDEX.md`, listing the 3 most recently paused cells with their next steps (one line
   each).
6. **The recorded NEXT STEP is the key piece:** ONE concrete action, doable in under
   5 minutes, without thinking. Propose it and confirm it.
   Good: "run `npm test` and read the first error". Bad: "continue the refactor".
7. **Stray ideas from the session** → `vault/state/parking-lot.md`, one line each:
   `- [YYYY-MM-DD] <idea> (context: cell <name>)`. Nothing is ever deleted there.
8. **One-line goodbye**, light, with no guilt and no list of pending work.
   Cells know how to wait.

## Deterministic alternative to hand-editing

```
node tools/cellmode/cli.mjs pause --facts "..." --next "..." \
    [--decisions "..."] [--build green|red "..."] [--note "..."]
node tools/cellmode/cli.mjs complete --facts "..." --confirm [--decisions "..."]
node tools/cellmode/cli.mjs park "<idea>"
node tools/cellmode/cli.mjs check
```

`pause` requires an active cell and a non-empty `--next`. `complete` refuses without
`--confirm` (exit 5: human confirmation required) — the flag stands for the human's
explicit "yes, we finished it", never for your own judgement. The CLI performs steps
2–5 and 7 in one deterministic transaction; you still own steps 0, 1, 6 and 8.

## Never

- Never minimize fatigue, and never suggest "just one more little thing".
- Never close without a recorded next step (resumable ⟺ recorded) — the single
  exception is a ✔ completed cell, whose next step is "—".
- Never turn the closing into a long retrospective.
- Never delete the file of a completed cell: it is history. Reopening the subject later
  means a NEW cell, not editing the ✔ one.
- Never rewrite or delete past log entries, even to "fix" them: append a correction.
