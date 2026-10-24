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
| `plan <name>` | `--area` (required), `--objective --deps` | Adds a 📋 row and a cell file. **No log entry** — a planned cell never ran. |
| `open <name>` | `--area --objective --in --out --done --next --deps` | New cell, or 📋 → 🔵. This is an *opening*, not a resume, and writes no log entry. Writes the cell file, the INDEX row and the CURRENT-CELL projection. |
| `resume <name>` | — | ⏸ → 🔵. Case-insensitive, exact match first, then substring. Prints a ≤5-line reconnection. |
| `pause` | `--facts` and `--next` (required), `--decisions --build --note` | 🔵 → ⏸. Appends the log entry, rewrites the cell file and the INDEX row, resets CURRENT-CELL to the "no active cell" form. |
| `complete` | `--facts` and `--confirm` (required), `--decisions --build --note` | 🔵 → ✔, next step `—`. The cell file is kept: a done cell is history. |
| `park <idea>` | — | Appends `- [date] <idea> (context: cell <name>)` to `parking-lot.md`. |
| `status` | — | ≤5-line reconnection for the active cell, otherwise the summarized waiting list. |
| `check` | — | Integrity guard over the log and its projections. |
| `op open <name>` | `--finish-line --pack --bar --cells` (all four required) | New operation, or ⏸ → 🔵 for one of the same slug. Writes `operations/<slug>.md`, appends the opening log entry, adds the operation header to `CURRENT-CELL.md`. |
| `op pause [name]` | `--facts` and `--next` (required) | 🔵 → ⏸. Refuses while a cell of that operation is 🔵. |
| `op complete [name]` | `--facts` and `--confirm` (required) | 🔵 → ✔. The pack expires with it. |
| `op status` | — | The active operation (finish line, fingerprint, pack, spend/ceiling, planned cells), or the paused ones, one line each. |
| `help` | — | Usage. |

`--build` defaults to the value already in the cell file (`—` when unknown): the
tool never claims a green build on your behalf.

## The first step (`--next` on `open`)

The `cell` skill creates a cell with a name, a boundary **and a first step**, so
`open` accepts `--next "<one concrete action>"` and writes it to the cell file's
`## ➜ NEXT STEP` section, the `Next step` column of `INDEX.md` and the
`CURRENT-CELL.md` projection — the same three places a `pause` writes it to, and
still **no log entry**: an opening is not a closure. It works on a promotion from
📋 as well. Omitting `--next` is allowed and changes nothing (the step stays `—`),
but `--next ""` is a usage error: a blank next step is not a next step. `plan` has
no `--next` on purpose — a planned cell carries intentions, not a first step.

## Declared dependencies (`--deps`)

`plan` and `open` accept `--deps "<a>, <b>"` and write the cell file's
`**Dependencies:**` field. Values are **normalised to slugs** (the cell ID), so
`--deps "Reading time, word-count"` is stored as `reading-time, word-count`:
a slug is what `INDEX.md` links to and what `cells/<slug>.md` is named, while a
free-form name would resolve to a different cell depending on how it was typed.
Commas or semicolons separate; duplicates are dropped; order is kept; an empty
list writes `—`.

Omitting `--deps` on `open` leaves the existing field untouched; `--deps ""`
clears it. A dependency naming a cell that does not exist is kept as written and
is **not** invented into existence — a reader of the field (the observer
dashboard, for instance) reports it as dangling. Nothing else derives an edge
between two cells: an undeclared dependency is no dependency.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. |
| 1 | Usage error: unknown command, unknown or empty option, missing cell name, no state (`init` first), state already initialized, no cell matched, cell is ✔ (terminal) or ⏸ (use `resume`). |
| 2 | Integrity findings (see below). Reported by `check` and by `open`/`resume`/`pause`/`complete`, which run the guard first. |
| 3 | Another cell is 🔵 (pause it first — one active cell at a time), another operation is 🔵 (`op open`), or a cell of the operation is 🔵 (`op pause`/`op complete`). |
| 4 | The name matched more than one paused cell, or more than one operation is 🔵 and none was named; the candidates are listed. |
| 5 | Human confirmation required: `complete` or `op complete` without `--confirm`. Marking a cell ✔, or closing an operation, is the human's call. |

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
| `operation-commands.mjs` | `op open`, `op pause`, `op complete`, `op status`. |
| `operation-lookup.mjs` | Which operation a command means, the refusals, the `op status` lines. |
| `operation-log.mjs` | Render the operation log entry (append-only, like `log.mjs`). |
| `transitions.mjs` | `open`, `resume`, `pause`, `complete`. |
| `activate.mjs` | The integrity guard, the one-active-cell refusal, the activation write path. |
| `state.mjs` | All filesystem I/O for `vault/state/`. |
| `index-table.mjs` | Parse/render `INDEX.md` (escaped pipes, link-form names, several tables). |
| `log.mjs` | Render/parse log entries; append-only by construction. |
| `cell-file.mjs` | Render/parse `cells/<slug>.md`. |
| `operation-file.mjs` | Render/parse `operations/<slug>.md`, the pack and the finish-line fingerprint — pure. |
| `projections.mjs` | `CURRENT-CELL.md` and the reconnection/summary text. |
| `check.mjs` | The integrity guard, pure. |
| `skeleton.mjs` | The empty state, shared with `templates/vault/state/`. |
| `clock.mjs` `paths.mjs` `slug.mjs` `fields.mjs` `args.mjs` `errors.mjs` | Small pure helpers. |
| `helpers.mjs` | Test plumbing (not a test file). |

## Operation files and the `op` family

`operation-file.mjs` is the data model of `vault/state/operations/<slug>.md` and the `op`
commands are its command surface (VERIFIED 2026-10-24). Still **not** built: the conflict
check between parallel cells, pack amendments, the spend roll-up from the cells, and
operation-aware `check` findings — `check` enforces the old one-active-cell rule and knows
nothing about operations, so it stays green on a log carrying operation entries instead of
reporting them. Hand-writing the same files stays fully supported; the model exists so the
hand-written file and the command cannot drift into two formats.

```markdown
# Operation: Go live
**ID:** go-live · **Opened:** 2026-10-24 · **Status:** 🔵
**Finish line (frozen):** 1. ship the v2 rules · 2. publish the guide
**Fingerprint:** <sha256 of the normalized finish line, 64 hex>
**Authorization pack:** spend ceiling: 2k tokens · publisher: the maintainer · batches: deploy → 1 per day · requires-yes: push to main · denied: rm -rf · max-active-cells: 3
**Quality bar:** every claim carries an epistemic label
**Planned cells:** r2-operation-model, r3-op-command
**Spend so far:** 1.2k tokens
```

`parseOperationFile` / `renderOperationFile` round-trip it; `parsePack` / `renderPack` do the
pack line alone. The pack's vocabulary is **closed** — `PACK_GRANTS`: `spend ceiling`,
`publisher`, `batches` (each `op → limit`; a batch with no limit is rejected), `requires-yes`,
`denied`, `max-active-cells`. Any other key throws `PACK_UNKNOWN_GRANT: <key>`, and the
deny-list `PACK_FORBIDDEN_GRANTS` (`skip-gate(s)`, `skip-test(s)`, `skip-build`,
`skip-typecheck`, `destructive`, `destructive-operations`, `protected-resources`,
`protected-resource-mutation`, `force-push`, `delete-data`, `schema-change`) throws
`PACK_FORBIDDEN_GRANT: <key>`: skipping a gate or a test, a destructive operation and a
protected-resource mutation are not grants and a pack cannot make them ones.
`fingerprintFinishLine` is sha256 over the finish line after dropping the `N.` numbering,
collapsing whitespace, trimming, lowercasing and sorting — so renumbering or reordering the
same items keeps the fingerprint and a reworded, added or removed item changes it.

`op open` freezes the finish line: `--finish-line "a; b"` is split on `;` (or `·`), numbered
and fingerprinted, and **resuming a ⏸ operation may not move it** — a different fingerprint
for the same slug is exit 1, not a new opening. `--pack` is the field value itself: ` · `
between grants, `;` between batches (a `;` immediately before a known grant key is read as a
grant separator too, so `--pack "spend ceiling: 2k; requires-yes: push"` also works). A pack
error exits 1 carrying the model's own name (`PACK_UNKNOWN_GRANT: <key>`, …).

Each opening, pause and completion appends its own entry under
`## <stamp> · Operation: <name>` with `Status`, the frozen `Finish line`, the `Fingerprint`
(repeated in every entry, so a moved finish line is visible in the record), the `Pack`, the
`Quality bar`, the `Planned cells`, and `Facts`/`Next step`/`Spend so far` when the closure has
them. The heading says `Operation:` where a cell entry says `Cell:`: that is what keeps
`parseLog` and `check` reading only cell closures.

**`op pause` does not cascade to the cells** (decision, R3). A cell pause needs its own facts
and next step and the CLI will not invent them, so `op pause`/`op complete` with a 🔵 cell of
that operation is refused with exit 3 ("pause the cell first") rather than writing fiction
into the log: cascading is the human's decision, not a default.

While an operation is 🔵, `CURRENT-CELL.md` carries a two-line operation header above the cell
projection (`# Operation: <name> · 🔵 · spend <so far>/<ceiling>`, then the finish line), plain
text with no `**Key:**` field so the cell below still parses as before.

The cell file gained three OPTIONAL fields for the same layer — `**Operation:**`,
`**Base commit:**`, `**Spend:**` — rendered only when they carry a value, so a cell file
written before the operation layer round-trips byte for byte.

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

`templates/vault/state/` holds byte-identical copies of what `init` writes (including `operations/README.md`), for
adopters who prefer to copy a folder instead of running a tool. A test asserts
the two stay identical.
