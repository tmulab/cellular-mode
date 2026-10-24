# 03 · State and memory

Six pieces live under `vault/state/`: plain Markdown, readable and editable by a human,
diffable in version control, writable by any agent.

> **Historical note.** The original Portuguese files were `INDICE.md`, `celulas/`,
> `CELULA-ATUAL.md`, `log-celulas.md`, `estacionamento.md`. The English names below are
> canonical; a migrating project may keep either set if `AGENTS.md` points at the paths.

## 1. `log.md` — the record (append-only)

One entry per cell closure, **newest last**. Never edit or delete a past entry; append.

```markdown
---
## YYYY-MM-DD HH:MM · Cell: <name>
**Status:** ⏸ | ✔
**Operation:** <name; "—" outside an operation>
**Facts:** <what was done; files with exact paths>
**Decisions:** <never to be re-argued without a new fact>
**Build:** green | red (<one-line error>)
**Next step:** <same as the cell file; "—" when done>
**Spend:** <what this cell consumed, in the pack's unit; "—" when nothing>
**Personal note (optional):** <1 line>
```

**`Status` is an addition to the original format** (which left pause-or-completion to be
inferred from the index): it makes the log checkable on its own, and is additive — an old
log without it is valid, and a reader falls back to the index.

An operation opens and closes with entries of its own, same shape under the heading
`## YYYY-MM-DD HH:MM · Operation: <name>`: `Status`, the frozen finish line, its
`Fingerprint`, the pack in one line, the planned cells, and the conflicts named at each
cell opening. A change to the pack is **its own entry**, never an edit of the opening —
`**Pack amendment:** +cell <name>, approved by <human>` — and may not touch the finish
line or its fingerprint.

## 2. `INDEX.md` — the list of cells

One row per cell, kept current by the pause procedure.

```markdown
| Cell | Operation | Area | Status | Last visit | Next step (1 line) |
|---|---|---|---|---|---|
| Feed parser | Go live | ingest | ⏸ | 2026-03-14 | run `npm test` and read the first error |
```

The `Cell` column may be a link — `[Feed parser](cells/feed-parser.md)` — and both forms must
be accepted by any reader; `Operation` is `—` for a cell opened outside one. A file may hold
more than one table (grouped by area, say); a reader that stops at the first loses cells.

## 3. `operations/<slug>.md` — the state of an operation

```markdown
# Operation: <name>
**ID:** <slug> · **Opened:** <date> · **Status:** 🔵 | ⏸ | ✔
**Finish line (frozen):** <numbered list of what "finished" means>
**Fingerprint:** <hash of the finish line exactly as written at opening>
**Authorization pack:** spend ceiling: <...> · publisher: <who> · batches: <op → limit> · requires-yes: <...> · denied: <...> · max-active-cells: <n>
**Quality bar:** <the ruler for what is otherwise subjective judgement>
**Planned cells:** <the slugs the orchestrator may open on its own>
**Spend so far:** <sum of the cells' `Spend`, never above the ceiling>
```

The pack's vocabulary is **closed**: those six keys, nothing else. Anything outside it — a destructive
operation, mutating a protected resource, skipping a gate or a test — is not an authorization and cannot
become one (`04-collaboration.md`). The fingerprint is repeated in every closure entry and must still
match: a moved finish line becomes visible, not arguable.

## 4. `cells/<slug>.md` — the full state of each cell

```markdown
# Cell: <name>
**ID:** <slug>
**Area:** <package or topic>
**Opened:** <date> · **Status:** 🔵 | ⏸ | ✔ | 📋
**Operation:** <name; required while an operation is active>
**Base commit:** <the sha the work starts from>
**Objective:** <one sentence>
**Boundary:** in: <...> | NOT in: <...>
**Inputs:** <...> · **Outputs:** <...>
**Allowed operations:** <...> · **Prohibited operations:** <...>
**Dependencies:** <...>
**Done criterion (binary):** <gates green + behavior X>
**Last fact:** <with exact file path>
**Build/typecheck:** green | red (<one-line error>)
**Decisions:** <short list>
**Open issues:** <...>
**Minimal context (≤5 lines):** <only what is needed to reconnect>

## ➜ NEXT STEP (doable in <5 min, without thinking)
<ONE concrete action>
```

Original fields: ID/name, area, opened, status, boundary, last fact, build, decisions, minimal
context, next step. **Additions:** `Objective`, `Inputs`/`Outputs` (the contract's Provides/
Consumes, so a cell hands off without a rewrite), `Allowed`/`Prohibited operations`,
`Dependencies`, `Open issues`, `Done criterion`, `Operation`, `Base commit` — all optional,
except `Boundary` and `Operation` while an operation is active: the conflict check reads them.

The slug is the ID: kebab-case, ASCII, unique forever. Cell files are **never deleted**, ✔ included.

## 5. `CURRENT-CELL.md` — the pointer to what is active

With an active cell: a copy of its projection (the format above).
With no active cell:

```markdown
No active cell · 3 paused — see INDEX.md
- Feed parser · run `npm test` and read the first error
- Token bug · open src/auth.js line 88 and log the decoded claims
- Export CSV · add the quoting test for embedded commas
```

The three most recently paused cells, one line each. An agent reads this first at Level 3; it is deliberately a projection, so losing it costs nothing.

With an **active operation** it keeps this filename and gains a header — the operation, spend
against the ceiling, the human's pending decisions, the finish line with each item's state —
and then the table of the active cells:

```markdown
# Operation: Go live · 🔵 · spend 1.2k/2k · pending: the deploy window
Finish line: 1 ✔ published · 2 🔵 login · 3 📋 enrolment 404 · 4 📋 module 1 · 5 📋 admin
| Cell | Status | Conflicts declared | Next step |
|---|---|---|---|
| Login | 🔵 | none | run `npm test -w auth` |
| Enrolment | 🔵 | shares the test db with Login | open src/enrol.ts line 40 |
```

## 6. `parking-lot.md` — captured ideas

```markdown
- [2026-03-14] cache the parsed feed between runs (context: cell Feed parser)
- [2026-03-15] ✔ → cell Export CSV  rename the export columns
```

One line each, nothing ever deleted. An idea promoted to a cell is marked `✔ → cell <name>`; the line stays as the trace of where the cell came from.

## The projection principle: the log is truth

`INDEX.md`, `CURRENT-CELL.md`, `cells/*.md` and `operations/*.md` are **projections** of
`log.md`, an operation's status, spend and fingerprint included. If a projection diverges
from the log, **the log wins and the projection is corrected** — never the other way round.
That is what makes the state robust: the file that must never be lost is append-only, and
the files that are rewritten are derived. Two practical consequences:

- An agent may safely regenerate a damaged index, `CURRENT-CELL.md` or operation file.
- An agent may **not** "tidy" the log to match them. A mismatch is a finding to report.

## The integrity guard

Run it at the start of the `cell` procedure and at step 0 of the `pause` procedure.

1. Every ⏸ or ✔ cell in `INDEX.md` has **at least one entry** in `log.md` (📋 cells are exempt).
2. At most **one** 🔵 cell — or, with an operation open, at most `max-active-cells`, each with its conflicts named at opening.
3. `CURRENT-CELL.md` agrees with the index about which cell is active.
4. The index status of a cell matches the status of its last log entry.

If (1) fails — the log holds less than the index implies — **stop**, report **"log shrunk"**
naming the cells with no entry, reconstruct them from `INDEX.md` + `cells/*.md` marked
`[reconstructed]`, and only then continue: a reconstruction is never a normal entry.

`node tools/cellmode/cli.mjs check` implements all four checks: exit 0 when clean,
exit 2 with the findings printed when not. **Today it knows nothing about operations**
(VERIFIED 2026-10-23): check (2) is still the flat "at most one 🔵 cell", so a second active
cell inside an operation is reported as a finding. Operation-aware checks are PROPOSED.

## Pause and resume, step by step

**Pausing** (the full ritual, with the Never list, is `skills/pause/SKILL.md`):

1. Integrity guard.
2. Collect facts — files with exact paths, decisions, gate status. Facts, not intentions.
3. Append the log entry, then write the cell file projection.
4. Update the index row: ⏸ + today + one-line next step. Or, if the done criterion is met,
   ask "did we finish this cell?" and only on an explicit yes write ✔ with next step "—".
5. Rewrite `CURRENT-CELL.md` in its "no active cell" form (its operation header stays).
6. Park stray ideas, then a one-line goodbye. No pending list.

**Resuming:**

1. Integrity guard.
2. Read `CURRENT-CELL.md`: active cell → `cells/<slug>.md`; none → index, or the named cell.
3. Reconnect in ≤5 lines: cell · last fact · build status · NEXT STEP.
4. Ask "shall we continue?" and then **execute the next step** — do not re-plan it.
5. Mark 🔵 in the index and copy the projection into `CURRENT-CELL.md`.

Step 3 needs no code: if reconnection does, the minimal-context field was written badly.

## What the CLI adds

`tools/cellmode/` is an optional deterministic implementation of exactly this protocol.
It adds nothing to the method except: the `Status` field above, machine-checked refusals (two
active cells, a pause with no next step, a completion without `--confirm`), documented exit
codes, and a `CELLMODE_NOW` override for byte-identical state in examples and tests.
Hand-editing the files is fully supported and gives the same result.

**The operation layer in the CLI, today** (VERIFIED 2026-10-24): `op open|pause|complete|status`
write the operation file, its log entries and the `CURRENT-CELL.md` header. Not yet: the cell
`Operation`/`Base commit`/`Spend` fields on open, the conflict check and the amendment — by hand.
