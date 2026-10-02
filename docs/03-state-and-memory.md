# 03 · State and memory

Five pieces live under `vault/state/`. All are plain Markdown, readable and editable by
a human, diffable in version control, and writable by any agent.

> **Historical note.** The original Portuguese files were `INDICE.md`, `celulas/`,
> `CELULA-ATUAL.md`, `log-celulas.md` and `estacionamento.md`. The English names below
> are the canonical ones; a project migrating from the original may keep either set as
> long as `AGENTS.md` points at the right paths.

## 1. `log.md` — the record (append-only)

One entry per cell closure, **newest last**. Never edit or delete a past entry; correct
by appending.

```markdown
---
## YYYY-MM-DD HH:MM · Cell: <name>
**Status:** ⏸ | ✔
**Facts:** <what was done; files with exact paths>
**Decisions:** <never to be re-argued without a new fact>
**Build:** green | red (<one-line error>)
**Next step:** <same as the cell file; "—" when done>
**Personal note (optional):** <1 line>
```

**`Status` is an addition to the original format.** The original entry had no status
field; whether a closure was a pause or a completion had to be inferred from the index.
The field makes the log machine-checkable on its own (and lets `check` compare the index
status against the last log status for that cell). It is additive: an old log without
the field is still valid, and a reader should fall back to the index when it is absent.

## 2. `INDEX.md` — the list of cells

One row per cell, kept current by the pause procedure.

```markdown
| Cell | Area | Status | Last visit | Next step (1 line) |
|---|---|---|---|---|
| Feed parser | ingest | ⏸ | 2026-03-14 | run `npm test` and read the first error |
```

The `Cell` column may be a link — `[Feed parser](cells/feed-parser.md)` — and both forms
must be accepted by anything that reads the table. A file may legitimately contain more
than one table (grouped by area, for example); a reader that stops at the first table
silently loses half the cells.

## 3. `cells/<slug>.md` — the full state of each cell

```markdown
# Cell: <name>
**ID:** <slug>
**Area:** <package or topic>
**Opened:** <date> · **Status:** 🔵 | ⏸ | ✔ | 📋
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

Fields present in the original: ID/name, area, opened, status, boundary, last fact,
build, decisions, minimal context, next step. **Additions:** `Objective`, `Inputs` /
`Outputs` (lifted from the collaboration contract's Provides/Consumes so a cell can be
handed off without rewriting it), `Allowed` / `Prohibited operations`, `Dependencies`,
`Open issues`, and the explicit `Done criterion`. All additions are optional — omit any
line you have nothing to write on.

The slug is the ID: kebab-case, ASCII only, unique forever. Cell files are **never
deleted**, including ✔ ones.

## 4. `CURRENT-CELL.md` — the pointer to the active cell

With an active cell: a copy of its projection (the format above).
With no active cell:

```markdown
No active cell · 3 paused — see INDEX.md
- Feed parser · run `npm test` and read the first error
- Token bug · open src/auth.js line 88 and log the decoded claims
- Export CSV · add the quoting test for embedded commas
```

The three most recently paused cells, one line each. This file is what an agent reads
first at Level 3; it is deliberately a projection, so losing it costs nothing.

## 5. `parking-lot.md` — captured ideas

```markdown
- [2026-03-14] cache the parsed feed between runs (context: cell Feed parser)
- [2026-03-15] ✔ → cell Export CSV  rename the export columns
```

One line each, nothing ever deleted. An idea promoted to a cell is marked `✔ → cell
<name>`; the line stays as the trace of where the cell came from.

## The projection principle: the log is truth

`INDEX.md`, `CURRENT-CELL.md` and `cells/*.md` are **projections** of `log.md`. If any
projection diverges from the log, **the log wins and the projection is corrected** —
never the other way round. This is what makes the state robust: the only file that must
never be lost is append-only, and the only file that is ever rewritten is derived.

Two practical consequences:

- An agent may safely regenerate a damaged index or `CURRENT-CELL.md` from the log.
- An agent may **not** "tidy" the log to match an index. A mismatch is a finding to
  report, not a formatting problem to fix.

## The integrity guard

Run it at the start of the `cell` procedure and at step 0 of the `pause` procedure.

1. Every ⏸ or ✔ cell in `INDEX.md` has **at least one entry** in `log.md`
   (📋 planned cells are exempt — they never ran).
2. At most **one** 🔵 cell exists.
3. `CURRENT-CELL.md` agrees with the index about which cell is active.
4. The index status of a cell matches the status of its last log entry.

If (1) fails — the log holds less than the index implies — **stop**, report
**"log shrunk"** naming the cells with no entry, reconstruct the missing entries from
`INDEX.md` + `cells/*.md` marked `[reconstructed]`, and only then continue. A
reconstructed entry is honest about being a reconstruction; it is not a normal entry.

`node tools/cellmode/cli.mjs check` implements all four checks: exit 0 when clean,
exit 2 with the findings printed when not.

## Pause and resume, step by step

**Pausing** (the full ritual, with the Never list, is `skills/pause/SKILL.md`):

1. Integrity guard.
2. Collect facts — files with exact paths, decisions, gate status. Facts, not intentions.
3. Append the log entry.
4. Write the cell file projection.
5. Update the index row: ⏸ + today + one-line next step. Or, if the done criterion is
   met, ask "did we finish this cell?" and only on an explicit yes write ✔ with next
   step "—".
6. Rewrite `CURRENT-CELL.md` in its "no active cell" form.
7. Park stray ideas.
8. One-line goodbye. No pending list.

**Resuming:**

1. Integrity guard.
2. Read `CURRENT-CELL.md`. Active cell → read `cells/<slug>.md`. No active cell → the
   summarized index, or the cell the human named.
3. Reconnect in ≤5 lines: cell · last fact · build status · NEXT STEP.
4. Ask "shall we continue?" and then **execute the next step** — do not re-plan it.
5. Mark 🔵 in the index and copy the projection into `CURRENT-CELL.md`.

Nothing in step 3 requires reading the code first. If reconnection needs the code, the
minimal-context field was not written well enough.

## What the CLI adds

`tools/cellmode/` is an optional deterministic implementation of exactly this protocol.
It adds nothing to the method except: the `Status` field described above, machine-checked
refusals (two active cells, a pause with no next step, a completion without `--confirm`),
documented exit codes, and a `CELLMODE_NOW` override so examples and tests can produce
byte-identical state. Hand-editing the files remains fully supported and produces the
same result.
