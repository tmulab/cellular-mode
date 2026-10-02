---
name: cell
description: >
  Open, resume or choose a work cell in Cellular Mode. Use whenever the human says
  /cell or /celula (with or without a cell name), "let's resume", "where did we stop",
  "go back to cell X", "open a cell", "which cells do I have", "list the cells", or the
  Portuguese equivalents ("vamos retomar", "onde paramos", "volta para a célula X",
  "abrir célula", "quais células tenho"). Use it also at the start of any session in a
  project that contains vault/state/, and when the human asks for new work while no
  cell is open.
---

# Open, resume or choose a cell

## State sources

- `vault/state/INDEX.md` — every cell, with status and one-line next step.
- `vault/state/CURRENT-CELL.md` — projection of the ACTIVE cell (at most one).
- `vault/state/cells/<slug>.md` — full state of each cell.
- `vault/state/log.md` — append-only history; the source of truth.

Statuses: 📋 planned · 🔵 active (max. one) · ⏸ paused · ✔ done.

## 0. Integrity guard (before any routing)

Every ⏸ or ✔ cell in `INDEX.md` must have at least one entry in `log.md`
(📋 planned cells are exempt — they never ran). There must be at most one 🔵.
If the log holds less than the index implies: **stop**, report "log shrunk" and list
the cells with no entry, reconstruct the missing entries from `INDEX.md` +
`cells/*.md` marked `[reconstructed]`, and only then continue.
`node tools/cellmode/cli.mjs check` performs this guard deterministically
(exit 0 = clean, exit 2 = findings).

## Routing — decide which case applies first

**A. The human named a cell** ("/cell parser", "back to the fetcher cell"):

1. Find it in `INDEX.md` by approximate name match. Ambiguous → show only the 2–3
   candidates and ask which one.
2. If ANOTHER cell is 🔵 active: say "cell <Y> is active — I'll close it first" and run
   the full ritual in `skills/pause/SKILL.md` for it.
3. Load `cells/<slug>.md` → reconnect in ≤5 lines (cell, last fact, build status,
   NEXT STEP) → copy the projection into `CURRENT-CELL.md`, mark 🔵 in the index →
   ask "Shall we continue?" → execute the small next step IMMEDIATELY.
4. If the requested cell is 📋 planned, this is an OPENING, not a resume: create or
   complete `cells/<slug>.md` (a planned cell may already have a file with a drafted
   boundary), promote 📋 → 🔵, and follow the opening flow.

**B. No name, and a 🔵 cell exists:** resume it directly (≤5-line reconnection, then
execute the next step). Do not show the index.

**C. No name, none active, but ⏸ paused or 📋 planned cells exist:** show the
summarized index — one line each, `name · next step` — plus a "new cell" option, and
ask which to open. At most ~8 lines; if there are more cells, show the 6 most recent
and say how many others exist.

**D. No cell exists (or the human asked for a new one):** propose a name + boundary in
one sentence ("Cell: X — in: A, B; NOT in: C") + a first step. Confirm. Then create
`cells/<slug>.md`, a 🔵 row in `INDEX.md`, and the projection in `CURRENT-CELL.md`.

Slug: the name in kebab-case, ASCII only ("Parser for feeds" → `parser-for-feeds`).

## Deterministic alternative to hand-editing

Instead of editing the files manually you may run:

```
node tools/cellmode/cli.mjs status            # ≤5-line reconnection, or the summary list
node tools/cellmode/cli.mjs open <name> --area A --objective "..."
node tools/cellmode/cli.mjs resume <name>     # ⏸ → 🔵
node tools/cellmode/cli.mjs plan <name> --area A
node tools/cellmode/cli.mjs park "<idea>"
```

`open` and `resume` refuse while another cell is 🔵 (exit 3: pause it first) and
`resume` exits 4 listing candidates when the name is ambiguous. Both paths — manual
edits and the CLI — produce the same files; pick one per session and stay consistent.

## While working

Respect the seven rules in `AGENTS.md`. Only what is inside the boundary. Out-of-scope
ideas → `vault/state/parking-lot.md` in one line, then back to the cell: do not block
and do not follow them alone. The human decides whether to switch cells — and switching
means pausing the current cell through the full ritual, then opening the other one.
Decisions taken → record them in the cell file immediately, or they will be re-argued.

## Never

- Never open by listing everything the project is missing; it paralyses. The summarized
  index of case C is the maximum panorama allowed.
- Never reopen decisions already recorded as settled without a new fact.
- Never treat paused cells as a guilty backlog — coexisting paused cells are the normal
  state of the method.
- Never have two 🔵 active cells at the same time.
