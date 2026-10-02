# 02 · The cell lifecycle

## What a cell is

A **cell** is the unit of work of the method: one small objective, with an explicit
boundary, sized to fit ONE focus session (typically 30–120 minutes). Examples: "the feed
parser returns normalized records", "fix the token bug in login", "skeleton of module X
with its declared interface".

A cell has: a **name**, a **boundary** (in / NOT in), a **verifiable done criterion**,
and **recorded state** when it closes.

## States and symbols

| Symbol | State | Meaning |
|---|---|---|
| 📋 | planned | Declared but never run. No log entry — inventing one would be fiction in an append-only log. |
| 🔵 | active | Being worked on right now. **At most one in the whole project.** |
| ⏸ | paused | Closed with state recorded, waiting with its next step ready. Coexisting paused cells are normal. |
| ✔ | done | Done criterion met **and** confirmed by the human. Terminal. |

Paused cells are **not** debt. A paused cell breaks nothing, because its boundary held.
It waits in the index with the bait of its next step already written.

## Transition table

| From | To | Trigger | Guard | Who decides |
|---|---|---|---|---|
| (none) | 🔵 | `/cell` with no cell existing, or an explicit "new cell" | No other cell is 🔵; name + boundary + first step proposed and confirmed | Human confirms the agent's proposal |
| (none) | 📋 | A future cell is declared while working on another | None (planning is free) | Human |
| 📋 | 🔵 | `/cell <name>` on a planned cell | No other cell is 🔵 | Human |
| 🔵 | ⏸ | Stop signal, or switching cells | Facts collected; ONE next step recorded and confirmed | Human triggers; agent must not pause silently |
| 🔵 | ✔ | Done criterion appears to be met | **Explicit human confirmation** to the question "did we finish this cell?" | Human only |
| ⏸ | 🔵 | `/cell <name>`, or `/cell` with exactly one obvious candidate | No other cell is 🔵 | Human |
| 🔵 | 🔵 (other) | Switching the active cell | Not a direct transition: the current cell must pass through ⏸ by the full ritual first | Human's right |
| ✔ | — | — | Terminal. Nothing leaves ✔. | — |

Two consequences worth stating plainly:

- **📋 → 🔵 is an OPENING, not a resume.** A planned cell has no history to reconnect to;
  the agent must not pretend otherwise. It may already have a file with a drafted
  boundary, which opening completes.
- **Switching cells always costs a pause.** There is no "switch over the top". Closing
  the current cell first is what keeps the log honest and the return cheap.

## The cycle

### 1. Open (or resume) — the `cell` procedure

- `/cell <name>`: directed resume — load `cells/<slug>.md`, reconnect in ≤5 lines,
  execute the next step immediately.
- `/cell` with an active cell: resume it directly, no index.
- `/cell` with none active: summarized index (paused + planned, one line each, plus
  "new cell") and a choice.
- New opening: propose name + boundary in one sentence + first step. Confirm. Create the
  cell file, the 🔵 row in the index, and the `CURRENT-CELL.md` projection.

Full routing, including ambiguity and the integrity guard: `skills/cell/SKILL.md`.

### 2. Work

- Only what is inside the boundary. Ideas from outside go to the parking lot in one line
  and work resumes; switching cells is the human's right, always through the ritual.
- Small verifiable steps. Build/typecheck as a pulse (rule 4).
- Decisions are recorded in the cell file **when taken**, or they will be re-argued.

### 3. Close — the `pause` procedure

Facts into the log (append-only) → projection into `cells/<slug>.md` → index row updated
(⏸ or ✔) → `CURRENT-CELL.md` becomes the "no active cell" pointer → one next step under
five minutes → stray ideas parked → a light goodbye. Full ritual:
`skills/pause/SKILL.md`.

## Sizing

- **A good cell** fits one session, has ONE deliverable, and a binary done criterion
  (gates green + behavior X observable).
- **Too big:** split it BEFORE starting — never in the middle of fatigue, when the split
  itself becomes a decision you are too tired to make well.
- **Too small:** if closing costs more than the work, merge it with its neighbour.
- A cell that overflows the project's line limits was a sizing error, not a limit error
  (see `05-engineering-rules.md`).

## The next step is the load-bearing field

The recorded next step is the single most valuable line in the whole system, because it
is what the next session reads first.

- **Good:** "run `npm test` and read the first error."
- **Good:** "open `src/parse.js` line 40 and add the empty-input case to the switch."
- **Bad:** "continue the refactor." (Requires deciding before acting.)
- **Bad:** "think about the architecture." (Not doable in five minutes.)

Test: could a tired person do it in under five minutes without making a decision?

## What this lifecycle does NOT specify — open issues

These are deliberate gaps, not oversights. The original method never needed them, and
inventing semantics here would create behavior that nobody has validated in real use.

1. **No cancelled / abandoned state.** There is no way to mark a cell as "dropped". In
   practice such a cell stays ⏸ forever with a next step nobody takes, or gets ✔ with
   facts explaining that the goal was dropped — which abuses ✔. A future `✖ dropped`
   state would need its own guard (does it require a log entry? does it count as
   closed?). **Open.**
2. **Reopening a ✔ cell.** Not allowed: the file is history and is never deleted or
   edited. Returning to the subject means opening a NEW cell, which may reference the
   old slug in its minimal context. This keeps the log honest but loses the thread of
   "the same work, later". Whether a `supersedes:` field should make that link explicit
   is **open**.
3. **No mechanical multi-agent locking.** "At most one 🔵 cell" is a *convention checked
   after the fact* by the integrity guard, not a lock. Two agents working the same
   repository at the same time can both open a cell and both append to the log; the log
   survives (appends do not conflict semantically) but the index and `CURRENT-CELL.md`
   can end up inconsistent, and the guard will report it afterwards. Coordination today
   is human and by contract (`04-collaboration.md`). A real lock file, or a
   per-agent/per-worktree vault, is **open**.
4. **No cell dependencies in the lifecycle.** A cell file may list dependencies as prose,
   but nothing enforces an order, and there is no blocked state.
5. **Time is not modelled.** Cells have an opened date and a last-visit date; there is no
   duration, estimate or deadline anywhere, on purpose.
