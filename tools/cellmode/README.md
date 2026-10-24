# cellmode

A small, dependency-free helper for the Cellular Mode file protocol. It is **optional**:
every file it writes is plain Markdown, and an agent or a human may edit the same files by
hand. The CLI exists so the mechanical parts (append a log entry, keep the projections in
step, prove the state is consistent) are deterministic rather than remembered.

Node >= 18, built-ins only, ESM.

```
node tools/cellmode/cli.mjs <command> [options]
```

- `--root <dir>` — project root; state lives in `<root>/vault/state/`. Default: current directory.
- `CELLMODE_NOW="YYYY-MM-DD HH:MM"` — fixes the clock, for tests and reproducible examples.

## Commands

| Command | Options | Effect |
|---|---|---|
| `init` | — | Creates `vault/state/{log.md,INDEX.md,CURRENT-CELL.md,parking-lot.md,cells/README.md}`. Refuses if the folder exists. |
| `plan <name>` | `--area` (required), `--objective --deps` | Adds a 📋 row and a cell file. **No log entry** — a planned cell never ran. |
| `open <name>` | `--area --objective --in --out --done --next --deps`; inside an operation also `--amend-pack --confirm` | New cell, or 📋 → 🔵. This is an *opening*, not a resume, and writes no log entry. Writes the cell file, the INDEX row and the CURRENT-CELL projection. |
| `resume <name>` | inside an operation: `--amend-pack --confirm` | ⏸ → 🔵. Case-insensitive, exact match first, then substring. Prints a ≤5-line reconnection. |
| `pause [name]` | `--facts` and `--next` (required), `--decisions --build --note --spend` | 🔵 → ⏸. Appends the log entry, rewrites the cell file and the INDEX row, resets CURRENT-CELL to the "no active cell" form. |
| `complete [name]` | `--facts` and `--confirm` (required), `--decisions --build --note --spend` | 🔵 → ✔, next step `—`. The cell file is kept: a done cell is history. |
| `park <idea>` | — | Appends `- [date] <idea> (context: cell <name>)` to `parking-lot.md`. |
| `status` | — | ≤5-line reconnection for the active cell, otherwise the summarized waiting list. |
| `check` | — | Integrity guard over the log and its projections. |
| `op open <name>` | `--finish-line --pack --bar --cells` (all four required) | New operation, or ⏸ → 🔵 for one of the same slug. Writes `operations/<slug>.md`, appends the opening log entry, adds the operation header to `CURRENT-CELL.md`. |
| `op pause [name]` | `--facts` and `--next` (required) | 🔵 → ⏸. Refuses while a cell of that operation is 🔵. |
| `op complete [name]` | `--facts` and `--confirm` (required) | 🔵 → ✔. The pack expires with it. |
| `op status` | — | The active operation (finish line, fingerprint, pack, spend/ceiling, planned cells), or the paused ones, one line each. |
| `help` | — | Usage. |

`[name]` on `pause`/`complete` is read only while an operation is 🔵; with no operation
they still take no positional argument. `--build` defaults to the value already in the
cell file (`—` when unknown): the tool never claims a green build on your behalf.

## The first step (`--next` on `open`)

The `cell` skill creates a cell with a name, a boundary **and a first step**, so `open`
accepts `--next "<one concrete action>"` and writes it to the cell file's
`## ➜ NEXT STEP` section, the `Next step` column of `INDEX.md` and `CURRENT-CELL.md` — the
three places a `pause` writes it to, and still **no log entry**: an opening is not a
closure. `--next ""` is a usage error, and `plan` has no `--next` at all: a planned cell
carries intentions, not a first step.

## Declared dependencies (`--deps`)

`plan` and `open` accept `--deps "<a>, <b>"` and write the cell file's `**Dependencies:**`
field. Values are **normalised to slugs** (the cell ID), so `--deps "Reading time,
word-count"` is stored as `reading-time, word-count`: a slug is what `INDEX.md` links to
and what `cells/<slug>.md` is named. Commas or semicolons separate, duplicates are
dropped, order is kept, an empty list writes `—`; omitting `--deps` on `open` leaves the
field untouched and `--deps ""` clears it. A dependency naming a cell that does not exist
is kept as written and reported as dangling, never invented into existence: nothing else
derives an edge, so an undeclared dependency is no dependency.

## A cell inside an operation

While an operation is 🔵 the four cell transitions gain four rules and only four
(`cell-in-operation.mjs`, VERIFIED 2026-10-24); with none 🔵 nothing changes at all.

1. **The boundary is required.** `open` is exit 1 unless `**Boundary:**` ends up concrete
   on BOTH sides: `--in "<what is in>" --out "<what is NOT in>"` are the two halves of
   that one field, a value already in the cell file counts, and the message names the
   missing flag — the conflict check between parallel cells reads the boundary, and `—`
   crosses with nothing.
2. **The ceiling replaces "one".** A cell opens while the number of 🔵 cells is below the
   pack's `max-active-cells`; at the ceiling it is exit 3 with the ceiling named, and
   `resume` obeys it too. A pack granting no `max-active-cells`, or something that is not
   a positive whole number, means **1** — the old rule.
3. **`Operation:` and `Base commit:`.** `open` writes the operation's name and the sha of
   `git rev-parse HEAD`; with no git, no repository or no commit the field says `UNKNOWN`,
   never a guess. `resume`/`pause`/`complete` keep writing the link and fill the base
   commit only when the cell has none: it is where that cell's work started.
4. **`Planned cells` is the line.** A cell on the list is the orchestrator's to open
   alone; one that is not is exit 1 (the message says UNPLANNED and lists the planned
   cells) unless the human says yes as `--amend-pack --confirm` — `--amend-pack` alone is
   exit 5. The amendment appends `**Pack amendment:** +cell <slug>, approved by human`
   under a `## <stamp> · Operation: <name>` heading and adds the slug to `Planned cells`;
   it **never** touches the finish line or its fingerprint, and repeats both in the entry
   so that is checkable.

`pause [name]` / `complete [name] --confirm` take the cell's name: optional while exactly
one cell is 🔵 (today's behaviour), **required** once more than one is, resolved like
`resume` (exit 1 when nothing matches, exit 4 when it is ambiguous, candidates listed).
Both accept `--spend "<amount>"` for the cell's `**Spend:**` field. With several 🔵 cells
`CURRENT-CELL.md` carries the operation header, then a
`| Cell | Area | Base commit | Next step |` table of them, then the full projection of the
most recently visited one, so a Level-3 read still reconnects to a cell and not to a list;
with exactly one it stays byte for byte the header plus the cell file.

## Exit codes

`0` ok · `1` usage: unknown command or option, missing name, no state, state already
there, no match, ✔ terminal, ⏸ needs `resume`, missing boundary, unplanned cell, missing
`[name]` with several 🔵 cells · `2` integrity findings, from `check` and from the four
transitions, which run the guard first · `3` a cell is 🔵 (one at a time), the pack's
`max-active-cells` is reached, an operation is 🔵 (`op open`), or a cell of it is 🔵
(`op pause`/`op complete`) · `4` ambiguous name, candidates listed · `5` confirmation
required (`complete`, `op complete`, `--amend-pack`).

## Integrity findings

| Code | Condition |
|---|---|
| `log-shrunk` | A ⏸ or ✔ cell in `INDEX.md` has no entry in `log.md` (📋 cells are exempt). |
| `two-active` | More than one 🔵 row **and no operation is 🔵** — the old one-active-cell rule. |
| `over-ceiling` | An operation is 🔵 and the 🔵 rows exceed its `max-active-cells` (named in the message). |
| `current-cell-mismatch` | `CURRENT-CELL.md` and the 🔵 row(s) in `INDEX.md` disagree; with several 🔵 cells the file must project one OF them. |
| `status-mismatch` | The `INDEX.md` status differs from the last logged status for that cell. |

The log is the single source of truth and is only ever **appended** (`fs.appendFileSync`);
`INDEX.md`, `CURRENT-CELL.md` and `cells/*.md` are projections. When a projection
diverges, the log wins and the projection is corrected.

## Modules

Pure logic is separate from filesystem access; `state.mjs` is the only module that reads
or writes vault files.

| File | Role |
|---|---|
| `cli.mjs` `main.mjs` | Entry point (sets `process.exitCode`), then dispatch and usage text — `main` returns an exit code instead of exiting. |
| `commands.mjs` | `init`, `plan`, `park`, `status`, `check`, the command registry, and the one branch that picks the in-operation transition. |
| `operation-commands.mjs` | `op open`, `op pause`, `op complete`, `op status`; `operation-lookup.mjs` answers which operation a command means and holds the refusals, `operation-log.mjs` renders their log entries. |
| `transitions.mjs` | `open`, `resume`, `pause`, `complete` with no operation active, and the shared closing path. |
| `cell-in-operation.mjs` | The same four transitions inside a 🔵 operation; `-rules.mjs` holds the four added rules (ceiling, planned cells, boundary, which 🔵 cell a `[name]` means), `-state.mjs` the base commit and the pack amendment (composed from `state.mjs`). |
| `activate.mjs` | The integrity guard, the one-active-cell refusal, the activation write path. |
| `state.mjs` | All filesystem I/O for `vault/state/`. |
| `index-table.mjs` | Parse/render `INDEX.md` (escaped pipes, link-form names, several tables). |
| `log.mjs` `cell-file.mjs` | Render/parse log entries (append-only by construction) and `cells/<slug>.md`. |
| `operation-file.mjs` | Render/parse `operations/<slug>.md`, the pack and the finish-line fingerprint — pure. |
| `projections.mjs` | `CURRENT-CELL.md` (header, active-cells table) and the reconnection/summary text. |
| `check.mjs` | The integrity guard and the ceiling, pure; `skeleton.mjs` is the empty state, shared with `templates/vault/state/`. |
| `clock` `paths` `slug` `fields` `args` `errors` | Small pure helpers; `helpers.mjs` is test plumbing, not a test file. |

## Operation files and the `op` family

`operation-file.mjs` is the data model of `vault/state/operations/<slug>.md` and the `op`
commands are its command surface. Still **not** built: the conflict check between parallel
cells (the crossing of boundaries, dependencies and shared resources) and the spend
roll-up to `Spend so far`. Hand-writing the same files stays fully supported; the model
exists so the hand-written file and the command cannot drift apart.

The file format is in `docs/03-state-and-memory.md` §3; `parseOperationFile` /
`renderOperationFile` round-trip it and `parsePack` / `renderPack` do the pack line alone.
The pack's vocabulary is **closed** — `PACK_GRANTS`: `spend ceiling`, `publisher`,
`batches` (each `op → limit`; a batch with no limit is rejected), `requires-yes`,
`denied`, `max-active-cells`. Any other key throws `PACK_UNKNOWN_GRANT: <key>`, and every
name in `PACK_FORBIDDEN_GRANTS` (the `skip-*` family, `destructive*`, the protected
resources, `force-push`, `delete-data`, `schema-change`) throws
`PACK_FORBIDDEN_GRANT: <key>`: those are not grants and a pack cannot make them ones.
`fingerprintFinishLine` is sha256 over the finish line after dropping the `N.` numbering,
collapsing whitespace, trimming, lowercasing and sorting, so renumbering or reordering the
same items keeps it and a reworded, added or removed item changes it.

`op open` freezes the finish line: `--finish-line "a; b"` is split on `;` (or `·`),
numbered and fingerprinted, and **resuming a ⏸ operation may not move it** — a different
fingerprint for the same slug is exit 1, not a new opening. `--pack` is the field value
itself: ` · ` between grants, `;` between batches (a `;` immediately before a known grant
key is read as a grant separator too). A pack error exits 1 carrying the model's own name.

Each opening, pause, completion and pack amendment appends its own entry under
`## <stamp> · Operation: <name>`, always with the `Status`, the frozen `Finish line` and
the `Fingerprint` — repeated in every entry, so a moved finish line is visible in the
record itself. The heading says `Operation:` where a cell entry says `Cell:`: that is what
keeps `parseLog` and `check` reading only cell closures.

**`op pause` does not cascade to the cells** (decision, R3). A cell pause needs its own
facts and next step and the CLI will not invent them, so `op pause`/`op complete` with a 🔵
cell of that operation is exit 3 ("pause the cell first") rather than fiction in the log.

The operation header above the cell projection is plain text with no `**Key:**` field, so
the cell below it still parses as before. The cell file carries three OPTIONAL fields for
this layer — `**Operation:**`, `**Base commit:**`, `**Spend:**` — rendered only when they
have a value, so a cell file written before the operation layer round-trips byte for byte.

## Tests

```
npm test                                  # whole repo
node --test "tools/cellmode/**/*.test.mjs"  # this tool only
```

Positional arguments to `node --test` are globs, not directories, so quote the pattern
rather than passing `tools/cellmode/`. Each test runs in a fresh temporary directory and
drives the real CLI in a child process with a fixed clock: the assertions are about files
on disk, not mocks.

## Addition to the original protocol

`**Status:** ⏸ | ✔` in the log entry is **new**. The original format left the closing
status implicit in prose; making it an explicit field is what lets `check` compare the log
against `INDEX.md` mechanically.
`templates/vault/state/` holds byte-identical copies of what `init` writes (including
`operations/README.md`), for adopters who prefer to copy a folder. A test asserts the two
stay identical.
