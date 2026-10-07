This project uses **Cellular Mode**: work happens in small bounded cells whose state is always
recorded, so stopping is cheap and resuming is almost instant.

- Session start, or any request to resume → read `skills/cell/SKILL.md` and follow it.
- Any stop signal ("stop here", "note this down") → read `skills/pause/SKILL.md` and follow it.
- Cell state lives in `vault/state/`: `log.md` is the append-only source of truth; `INDEX.md`,
  `CURRENT-CELL.md`, `cells/<slug>.md` and `parking-lot.md` are projections of it.
- One ACTIVE cell at a time. Gates green before any test claim. Batch and destructive operations
  need explicit human approval. Recorded or it did not happen.

These lines are a pointer, not the method: the rules themselves are in the files named above.
