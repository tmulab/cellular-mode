# cellmode

A small, dependency-free helper for the Cellular Mode file protocol. It is
**optional**: every file it writes is plain Markdown, and an agent or a human may
edit the same files by hand. The CLI exists so the mechanical parts (append a log
entry, keep the projections in step, prove the state is consistent) are
deterministic rather than remembered.

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
| `plan <name>` | `--area` (required), `--objective` | Adds a 📋 row and a cell file. **No log entry** — a planned cell never ran. |
| `open <name>` | `--area --objective --in --out --done` | New cell, or 📋 → 🔵. This is an *opening*, not a resume, and writes no log entry. Writes the cell file, the INDEX row and the CURRENT-CELL projection. |
| `resume <name>` | — | ⏸ → 🔵. Case-insensitive, exact match first, then substring. Prints a ≤5-line reconnection. |
| `pause` | `--facts` and `--next` (required), `--decisions --build --note` | 🔵 → ⏸. Appends the log entry, rewrites the cell file and the INDEX row, resets CURRENT-CELL to the "no active cell" form. |
| `complete` | `--facts` and `--confirm` (required), `--decisions --build --note` | 🔵 → ✔, next step `—`. The cell file is kept: a done cell is history. |
| `park <idea>` | — | Appends `- [date] <idea> (context: cell <name>)` to `parking-lot.md`. |
| `status` | — | ≤5-line reconnection for the active cell, otherwise the summarized waiting list. |
| `check` | — | Integrity guard over the log and its projections. |
| `help` | — | Usage. |

`--build` defaults to the value already in the cell file (`—` when unknown): the
tool never claims a green build on your behalf.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. |
| 1 | Usage error: unknown command, unknown or empty option, missing cell name, no state (`init` first), state already initialized, no cell matched, cell is ✔ (terminal) or ⏸ (use `resume`). |
| 2 | Integrity findings (see below). Reported by `check` and by `open`/`resume`/`pause`/`complete`, which run the guard first. |
| 3 | Another cell is 🔵. Pause it first — one active cell at a time. |
| 4 | The name matched more than one paused cell; the candidates are listed. |
| 5 | Human confirmation required: `complete` without `--confirm`. Marking a cell ✔ is the human's call. |

## Integrity findings

| Code | Condition |
|---|---|
| `log-shrunk` | A ⏸ or ✔ cell in `INDEX.md` has no entry in `log.md` (📋 cells are exempt). |
| `two-active` | More than one 🔵 row. |
| `current-cell-mismatch` | `CURRENT-CELL.md` and the 🔵 row in `INDEX.md` disagree. |
| `status-mismatch` | The `INDEX.md` status differs from the last logged status for that cell. |

The log is the single source of truth and is only ever **appended**
(`fs.appendFileSync`); `INDEX.md`, `CURRENT-CELL.md` and `cells/*.md` are
projections. When a projection diverges, the log wins and the projection is
corrected — never the other way round.

## Modules

Pure logic is separate from filesystem access, so most of it is testable without
a disk. `state.mjs` is the only module that reads or writes vault files.

| File | Role |
|---|---|
| `cli.mjs` | Entry point: sets `process.exitCode` from `main(process.argv)`. |
| `main.mjs` | Dispatch and usage text; returns an exit code instead of exiting. |
| `commands.mjs` | `init`, `plan`, `park`, `status`, `check` + the command registry. |
| `transitions.mjs` | `open`, `resume`, `pause`, `complete` and the shared guard. |
| `state.mjs` | All filesystem I/O for `vault/state/`. |
| `index-table.mjs` | Parse/render `INDEX.md` (escaped pipes, link-form names, several tables). |
| `log.mjs` | Render/parse log entries; append-only by construction. |
| `cell-file.mjs` | Render/parse `cells/<slug>.md`. |
| `projections.mjs` | `CURRENT-CELL.md` and the reconnection/summary text. |
| `check.mjs` | The integrity guard, pure. |
| `skeleton.mjs` | The empty state, shared with `templates/vault/state/`. |
| `clock.mjs` `paths.mjs` `slug.mjs` `fields.mjs` `args.mjs` `errors.mjs` | Small pure helpers. |
| `helpers.mjs` | Test plumbing (not a test file). |

## Tests

```
npm test                                  # whole repo
node --test "tools/cellmode/**/*.test.mjs"  # this tool only
```

Positional arguments to `node --test` are globs, not directories, so quote the
pattern rather than passing `tools/cellmode/`.

Each test runs in a fresh temporary directory and drives the real CLI in a child
process with a fixed clock, so the assertions are about files on disk, not mocks.

## Addition to the original protocol

`**Status:** ⏸ | ✔` in the log entry is **new**. The original format left the
closing status implicit in prose; making it an explicit field is what lets
`check` compare the log against `INDEX.md` mechanically.

`templates/vault/state/` holds byte-identical copies of what `init` writes, for
adopters who prefer to copy a folder instead of running a tool. A test asserts
the two stay identical.
