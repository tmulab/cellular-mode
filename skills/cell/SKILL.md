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
- `vault/state/CURRENT-CELL.md` — the operation header, if any, + the active projection.
- `vault/state/cells/<slug>.md` · `operations/<slug>.md` — each cell, each operation.
- `vault/state/log.md` — append-only history; the source of truth.

Statuses: 📋 planned · 🔵 active · ⏸ paused · ✔ done. **Outside an operation there is
at most one 🔵**; inside one, up to its declared `max-active-cells`.

## 0. Integrity guard (before any routing)

Every ⏸ or ✔ cell in `INDEX.md` must have at least one entry in `log.md` (📋 planned
cells are exempt — they never ran), and the 🔵 count must respect the rule above. If the
log holds less than the index implies: **stop**, report "log shrunk", list the cells
with no entry, reconstruct them from `INDEX.md` + `cells/*.md` marked `[reconstructed]`,
then continue. `node tools/cellmode/cli.mjs check` is this guard (0 = clean, 2 = findings).

## Optional: the declared working mode

If `tools/adaptive/` exists, run `node tools/adaptive/cli.mjs context` and apply the block
it prints (empty output = the default, work normally). Never set a mode: `skills/mode/SKILL.md`.

## Inside an operation

If `CURRENT-CELL.md` carries an operation header, read `operations/<slug>.md` first —
finish line, pack, ceiling, planned cells — then, for EVERY opening or resume in it:

- **The boundary is required:** `--in "<what is in>" --out "<what is NOT in>"` are the
  halves of one concrete `Boundary`, with the done criterion and the budget; `open`
  refuses without them and writes `Operation:` and `Base commit:` (`UNKNOWN` with no
  git, never a guess).
- **Name the conflicts** with each cell already 🔵 — the files and resources they share
  — or say **"none"**, in the opening's log entry. No tool crosses those boundaries yet
  (PROPOSED), so you do it by hand.
- **The ceiling replaces "one":** at `max-active-cells`, pause a cell first; `resume`
  obeys it too, and a pack with no valid ceiling means 1.
- **A cell outside `Planned cells` needs the human's explicit yes**, recorded as a pack
  amendment (`--amend-pack --confirm`) — never your own judgement.
- The operation itself: `skills/operation/SKILL.md`; a worker: `skills/worker/SKILL.md`.

## Routing — decide which case applies first

**A. The human named a cell** ("/cell parser", "back to the fetcher cell"):

1. Find it in `INDEX.md` by approximate name match; ambiguous → show the 2–3 candidates.
2. If ANOTHER cell is 🔵: outside an operation, say "cell <Y> is active — I'll close it
   first" and run the full ritual in `skills/pause/SKILL.md` for it; inside one, both
   may stay 🔵 if the ceiling allows and you named the conflicts.
3. Load `cells/<slug>.md` → reconnect in ≤5 lines (cell, last fact, build status,
   NEXT STEP) → copy the projection into `CURRENT-CELL.md`, mark 🔵 in the index →
   ask "Shall we continue?" → execute the small next step IMMEDIATELY.
4. If the cell is 📋 planned, this is an OPENING, not a resume: create or complete
   `cells/<slug>.md` (a planned cell may already carry a drafted boundary), promote
   📋 → 🔵, and follow the opening flow.

**B. No name, and a 🔵 cell exists:** resume it directly (≤5-line reconnection, then the
next step); do not show the index. With several 🔵 in an operation, resume the most
recently visited and name the others in one line.

**C. No name, none active, but ⏸ paused or 📋 planned cells exist:** show the
summarized index — one line each, `name · next step` — plus a "new cell" option, and ask
which to open. At most ~8 lines; beyond that, the 6 most recent and how many others.

**D. No cell exists (or the human asked for a new one):** propose a name + boundary in
one sentence ("Cell: X — in: A, B; NOT in: C") + a first step. Confirm. Then create
`cells/<slug>.md`, a 🔵 row in `INDEX.md`, and the projection in `CURRENT-CELL.md`.
Slug: the name in kebab-case, ASCII only ("Parser for feeds" → `parser-for-feeds`).

## Deterministic alternative to hand-editing

```
node tools/cellmode/cli.mjs status            # ≤5-line reconnection, or the summary list
node tools/cellmode/cli.mjs open <name> --area A --objective "..." --next "<first step>"
node tools/cellmode/cli.mjs resume <name>     # ⏸ → 🔵
node tools/cellmode/cli.mjs plan <name> --area A
node tools/cellmode/cli.mjs park "<idea>"
```

`--next` on `open` records the FIRST STEP this skill asks for at creation, in the cell
file, the INDEX row and `CURRENT-CELL.md`; omitting it leaves `—`, an empty `--next ""`
is refused, and `plan` has no `--next`: a planned cell carries intentions only.

Outside an operation, `open`/`resume` refuse while another cell is 🔵 (exit 3: pause it
first) and `check` reports `two-active`. Inside one they refuse at the ceiling (exit 3,
ceiling named), without a concrete boundary, or for an unplanned cell lacking
`--amend-pack --confirm` (`--amend-pack` alone is exit 5), and `check` reports
`over-ceiling` instead (VERIFIED 2026-10-24, `tools/cellmode/README.md`; not re-run
here). An ambiguous name on `resume` is exit 4 with the candidates listed.

## While working

Respect the seven rules in `AGENTS.md`. Only what is inside the boundary, and never
expand the scope of a cell or of its operation on your own initiative. Out-of-scope
ideas → `vault/state/parking-lot.md` in one line, then back to the cell: do not block
and do not follow them alone. The human decides whether to switch cells; switching means
pausing the current cell through the full ritual, then opening the other. Decisions
taken → record them in the cell file immediately, or they will be re-argued.

## Never

- Never open by listing all the project lacks: case C's index is the maximum panorama.
- Never reopen decisions already recorded as settled without a new fact.
- Never treat paused cells as a guilty backlog — coexisting paused cells are normal.
- Never have two 🔵 cells outside an operation, nor more than the operation's
  `max-active-cells` inside one.
