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
| 🔵 | active | Being worked on right now. **At most one in the whole project** outside an operation; inside one, up to the pack's `max-active-cells`. |
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
- **Inside an operation the "no other cell is 🔵" guard becomes a count plus a conflict
  check** (next section). Everything else in the table holds unchanged.

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

## Operations and parallel cells

An **operation** is the unit above the cell: the human's unit of attention. **One
operation is ACTIVE at a time**, and inside it several cells may be 🔵 at once, up to the
`max-active-cells` of its authorization pack. Outside an operation nothing changes: one
🔵 cell at a time, and small projects never need the layer at all.

Opening an operation is four declarations, asked one at a time (the file format is in
`03-state-and-memory.md`):

1. **Finish line**, frozen at opening, with a fingerprint — what "finished" means, which
   no later discovery edits. Discoveries go to the parking lot; moving the line is a
   recorded decision (rule 6).
2. **Authorization pack**, in a closed vocabulary — spend ceiling · publisher · batches
   with limits · requires-yes · denied list · max-active-cells. It can never grant a
   destructive operation, the mutation of a protected resource, or skipping a gate or a
   test (`04-collaboration.md`), and it expires with the operation.
3. **Quality bar** — the subjective ruler the result is judged by, written once instead
   of re-argued per cell.
4. **Planned cells** — the cells the orchestrator may open on its own.

Then the lifecycle is short: cells open, work and close exactly as described above, each
carrying `Operation:` and `Base commit:` in its file → **`op pause` and `op complete`
refuse while a cell of the operation is 🔵** (exit 3): the cells are paused first, each
with its own facts and its own next step, because a pause nobody wrote is fiction and
neither the CLI nor the orchestrator may invent one — cascading is the human's decision,
not a default (decision of cell R3, VERIFIED 2026-10-24) → **completing the operation
then requires an explicit human confirmation**, like completing a cell, never on the
agent's initiative.

### Opening a cell beside another: naming the conflicts

Before a second cell goes 🔵 in the same operation, the conflict step is **mandatory**,
at two levels:

- **Mechanical:** cross the candidate's `Boundary`, `Dependencies` and `Inputs`/`Outputs`
  against every active cell and against the shared resources the pack names (test
  database, migration, GPU, a shared file). The same file in two boundaries is a
  **refusal**; a shared resource is a **warning** to be declared, not a refusal.
- **Semantic:** the orchestrator reads both cell files and names what no crossing of
  fields can see — "A rewrites the JSON that B reads" — or says **"none"**. Saying
  nothing is not an option: the sentence belongs in the log entry of the opening.

A cell that is **not** in `Planned cells` is not the orchestrator's to open. It needs the
human's yes, recorded as an amendment to the pack, and the amendment never touches the
finish line.

**Decided, and built** (VERIFIED 2026-10-24). The model above replaces the "no mechanical
multi-agent locking" gap this file used to list as an open question. Built: `op
open|pause|complete|status`, the `Operation:`/`Base commit:` fields written by `open`,
the `max-active-cells` ceiling, the amendment entry via `--amend-pack --confirm`, a
`check` that reports `two-active` only outside an operation (`over-ceiling` inside), and
the MECHANICAL crossing of this section (cell R4b): `cellmode conflicts <cell>` prints
the `| Cell | Overlapping paths | Shared resources | Verdict |` table read-only, and
`open` inside an operation runs the same crossing before it writes anything — an
overlapping in-path is a refusal (exit 3) unless the human adds `--confirm`, a shared
resource is a warning, and the verdict is recorded as `**Conflicts:** …` in the
operation's log entry for that opening. The SEMANTIC half is still the orchestrator's
sentence, by construction: no crossing of fields can see it. **Built too (cell R5), the
six operation findings of `check`:** `finish-line-moved` (the file's `Fingerprint`, or
the hash of its `Finish line`, is not what the opening log entry recorded),
`pack-missing` (a 🔵 operation whose pack is `—`), `pack-grants-forbidden` (a pack the
CLOSED vocabulary rejects, named with the model's own error instead of crashing the
command), `spend-over-ceiling` (the cells' `Spend` past a NUMERIC `spend ceiling`; a
value like `2k tokens` is skipped, never guessed), `cell-stale` (a 🔵 cell whose `Base
commit` is unrecorded, unknown to git, or no longer an ancestor of HEAD) and
`merge-unrecorded` (a merge of an `op/…` or `worktree-agent-…` branch, after the
operation's opening entry, that no log entry mentions). A ✔ operation is exempt from all
six: its pack expired with it and an append-only entry cannot be rewritten, so the
finding could never be cleared. Without git, or outside a work tree, the last two are
UNKNOWN and SAY so — one notice line in the output, never silence and never a pass; they
are deliberately not findings there, because "there is no repository here" is a fact
about the environment and would leave every vault in a plain directory red with nothing
to fix. When git does answer, an UNKNOWN answer is the vault's own gap and IS a finding
(exit 2). **PROPOSED:** `map-stale` and the operation-aware report (cell R7).

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
3. **Still no lock, and no per-worktree vault.** With parallel cells decided, "how many
   🔵 cells" is answered, but the *mechanism* is not: there is no lock file, so two
   agents can still both write the index and `CURRENT-CELL.md`. The method's answer is
   organisational — one cell per worktree, and only the orchestrator writes the vault —
   and whether a lock file or a per-agent vault should replace it is **open**.
4. **No cell dependencies in the lifecycle.** A cell file may list dependencies as prose,
   but nothing enforces an order, and there is no blocked state.
5. **Time is not modelled.** Cells have an opened date and a last-visit date; there is no
   duration, estimate or deadline anywhere, on purpose.
