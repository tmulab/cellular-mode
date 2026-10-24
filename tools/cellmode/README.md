# cellmode

A small, dependency-free helper for the Cellular Mode file protocol. It is **optional**: every file it writes is plain
Markdown and a human or an agent may edit it by hand. The CLI exists so the mechanical parts (append a log entry, keep
the projections in step, prove the state is consistent, draw the map) are deterministic. Node >= 18, built-ins, ESM.

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
| `open <name>` | `--area --objective --in --out --done --next --deps`; inside an operation also `--amend-pack --confirm` (and `--confirm` to accept an overlap) | New cell, or 📋 → 🔵. This is an *opening*, not a resume, and writes no log entry. Writes the cell file, the INDEX row and the CURRENT-CELL projection. |
| `resume <name>` | inside an operation: `--amend-pack --confirm` | ⏸ → 🔵. Case-insensitive, exact match first, then substring. Prints a ≤5-line reconnection. |
| `pause [name]` | `--facts` and `--next` (required), `--decisions --build --note --spend` | 🔵 → ⏸. Appends the log entry, rewrites the cell file and the INDEX row, resets CURRENT-CELL to the "no active cell" form. |
| `complete [name]` | `--facts` and `--confirm` (required), `--decisions --build --note --spend` | 🔵 → ✔, next step `—`. The cell file is kept: a done cell is history. |
| `park <idea>` | — | Appends `- [date] <idea> (context: cell <name>)` to `parking-lot.md`. |
| `status` | — | ≤5-line reconnection for the active cell, otherwise the summarized waiting list. |
| `check` | — | Integrity guard over the log and its projections. |
| `report` | `--out <path>` (resolved against the root) | Writes the map of the vault as SVG (default `vault/state/map.svg`), generated from `log.md`, `INDEX.md` and `operations/`. |
| `conflicts <cell>` | — | **Read-only.** Crosses that cell against every other 🔵 cell of the active operation and prints the `\| Cell \| Overlapping paths \| Shared resources \| Verdict \|` table. Writes nothing; exit 0 whatever the verdict. |
| `op open <name>` | `--finish-line --pack --bar --cells` (all four required) | New operation, or ⏸ → 🔵 for one of the same slug. Writes `operations/<slug>.md`, appends the opening log entry, adds the operation header to `CURRENT-CELL.md`. |
| `op pause [name]` | `--facts` and `--next` (required) | 🔵 → ⏸. Refuses while a cell of that operation is 🔵. |
| `op complete [name]` | `--facts` and `--confirm` (required) | 🔵 → ✔. The pack expires with it. |
| `op status` | — | The active operation (finish line, fingerprint, pack, spend/ceiling, planned cells), or the paused ones, one line each. |
| `help` | — | Usage. |

`[name]` on `pause`/`complete` is read only while an operation is 🔵; with no operation they take no positional
argument. `--build` defaults to the cell file's value (`—` when unknown): the tool never claims a green build for you.

## The first step (`--next`) and the declared dependencies (`--deps`)

The `cell` skill creates a cell with a name, a boundary **and a first step**, so `open` accepts `--next "<action>"`
and writes it to the cell file's `## ➜ NEXT STEP` section, the `Next step` column of `INDEX.md` and `CURRENT-CELL.md`
— the three places a `pause` writes it to. `--next ""` is a usage error; `plan` has none: a plan carries intentions.

`plan` and `open` accept `--deps "<a>, <b>"` and write the cell file's `**Dependencies:**` field. Values are
**normalised to slugs** (the cell ID), so `--deps "Reading time, word-count"` is stored as `reading-time, word-count`:
a slug is what `INDEX.md` links to and what `cells/<slug>.md` is named. Commas or semicolons separate, duplicates go,
order is kept, an empty list writes `—`; on `open`, omitting `--deps` leaves the field and `--deps ""` clears it. A
dangling dependency is kept and reported, never invented.

## A cell inside an operation

While an operation is 🔵 the four cell transitions gain five rules and only five (`cell-in-operation.mjs`, VERIFIED
2026-10-24); with none 🔵 nothing changes at all.

1. **The boundary is required.** `open` is exit 1 unless `**Boundary:**` is concrete on BOTH sides (`--in "<what is
   in>" --out "<what is NOT in>"` are the two halves of that one field; a value already in the cell file counts, and
   the message names the missing flag) — rule 5 reads the boundary, and `—` crosses with nothing.
2. **The ceiling replaces "one".** A cell opens while the number of 🔵 cells is below the pack's `max-active-cells`; at
   the ceiling it is exit 3 with the ceiling named, and `resume` obeys it too. A pack granting no `max-active-cells`,
   or something that is not a positive whole number, means **1** — the old rule.
3. **`Operation:` and `Base commit:`.** `open` writes the operation's name and the sha of `git rev-parse HEAD`; with
   no git, repository or commit the field says `UNKNOWN`, never a guess. The other three keep writing the link and
   fill the base commit only when the cell has none: it is where that cell's work started.
4. **`Planned cells` is the line.** A cell on the list is the orchestrator's to open alone; one that is not is exit 1
   (the message says UNPLANNED and lists the planned cells) unless the human says yes as `--amend-pack --confirm`. The
   amendment appends `**Pack amendment:** +cell <slug>, approved by human` under a `## <stamp> · Operation: <name>`
   heading and adds the slug to `Planned cells`; it **never** touches the finish line or its fingerprint.
5. **The conflict crossing.** `open` crosses the cell it is about to open against every other 🔵 cell BEFORE writing
   anything (`conflicts.mjs`, the code `conflicts` prints): `overlap` is exit 3 naming the cells and the paths unless
   the human says `--confirm`, `shared` only warns, `none` is silent. The verdict is RECORDED either way —
   `**Conflicts:** overlap with <cell>: <paths> — accepted by human`, `shared <resource> with <cell>` or `none` — in
   its own operation entry (`## <stamp> · Operation: <name>`, invisible to `parseLog` and `check`, like an amendment).
   The FIRST cell of an operation crosses nobody, and its opening still writes no log entry at all.

The crossing reads the in-paths of each `**Boundary:**` (split on `,`), the `Dependencies` fields, and the resources
in `Inputs`/`Outputs` (`,` or `;`, lowercased) plus the pack's `batches` grants — nothing else. A **path overlap**
(the refusal) is one path CONTAINING the other: equal after normalizing (`\`→`/`, no leading `./`, no trailing `/`,
lowercased), a directory prefix at a **segment boundary** (`src` overlaps `src/a.ts`, never `srcx`), or a glob match
(`*`/`?` inside one segment, `**` across `/`, a trailing `/**` also holding its own directory; braces match
literally). A `NOT in:` entry **carves a hole**: an in-path its own `NOT in:` covers leaves that cell's in-set, and a
path the other cell's `NOT in:` covers is no conflict. **Shared resources** (the warning) are the tokens both cells
name, printed `<resource> (pack)` when a `batches` op has two cells spending one grant; a declared dependency either
way round is `shared` too. And the crossing is the MECHANICAL half only — "A rewrites the JSON B reads" is invisible
to it, so the orchestrator still names the semantic conflicts in words (`docs/02-cell-lifecycle.md`).

`pause [name]` / `complete [name] --confirm` take the cell's name: optional while exactly one cell is 🔵, **required**
once more than one is, resolved like `resume` (exit 1 when nothing matches, exit 4 when ambiguous). Both accept
`--spend "<amount>"` for the cell's `**Spend:**` field. With several 🔵 cells `CURRENT-CELL.md` carries the operation
header, a `| Cell | Area | Base commit | Next step |` table of them, then the full projection of the most recently
visited one, so a Level-3 read reconnects to a cell and not a list; with exactly one it stays byte for byte as before.

## The generated map

`report` draws `vault/state/map.svg` from the vault and from nothing else: the project's directory basename (never a
path), the 🔵 operation with each finish-line item's state (from the cells whose slug matches it, `itemMatches`: ✔
before 🔵 before ⏸, no match 📋), the cells by status with their last fact, what waits on the human (every ⏸ cell's
next step, and the parked lines naming one by a configurable word list that ships no name) and the totals.
`report-model.mjs` (vault → object) and `report-svg.mjs` (object → string) are PURE — same vault, same bytes; no
clock, no external font, no script, every vault string XML-escaped — and the embedded `<!-- cellmode-source:
sha256:… -->` over the three sources is what `map-stale` compares, reported by `check` and never a refusal of a
transition.

## Exit codes

`0` ok · `1` usage: unknown command or option, missing name, no state, state already there, no match, ✔ terminal, ⏸
needs `resume`, missing boundary, unplanned cell, missing `[name]` with several 🔵 cells · `2` integrity findings, from
`check` and from the four transitions, which run the guard first · `3` a cell is 🔵 (one at a time), the pack's
`max-active-cells` is reached, a boundary overlaps another 🔵 cell's (`open`, unless `--confirm`), an operation is 🔵
(`op open`), or a cell of it is 🔵 (`op pause`/`op complete`) · `4` ambiguous name · `5` confirmation required
(`complete`, `op complete`, `--amend-pack`).

## Integrity findings

| Code | Condition |
|---|---|
| `log-shrunk` | A ⏸ or ✔ cell in `INDEX.md` has no entry in `log.md` (📋 cells are exempt). |
| `two-active` | More than one 🔵 row **and no operation is 🔵** — the old one-active-cell rule. |
| `over-ceiling` | An operation is 🔵 and the 🔵 rows exceed its `max-active-cells` (named in the message). |
| `current-cell-mismatch` | `CURRENT-CELL.md` and the 🔵 row(s) in `INDEX.md` disagree; with several 🔵 cells the file must project one OF them. |
| `status-mismatch` | The `INDEX.md` status differs from the last logged status for that cell. |
| `finish-line-moved` | An operation that is not ✔ carries a `Fingerprint`, or a `Finish line`, that is not what its opening log entry recorded. |
| `pack-missing` | The 🔵 operation's `Authorization pack` is empty (`—`), so it authorizes nothing. |
| `pack-grants-forbidden` | `parsePack` rejects the pack TEXT of an operation that is not ✔; the message carries the model's own named error. |
| `spend-over-ceiling` | The cells' `Spend` summed (or `Spend so far`, whichever is greater) is above a **numeric** `spend ceiling`. |
| `cell-stale` | A 🔵 cell of an operation whose `Base commit` is unrecorded, unknown to git, or not an ancestor of HEAD. |
| `merge-unrecorded` | A merge commit after the operation's opening entry names an `op/…` or `worktree-agent-…` branch that no log entry mentions. |
| `map-stale` | `vault/state/map.svg` exists and its embedded source fingerprint is not the one `log.md`, `INDEX.md` and `operations/` hash to now (no map file: no finding). |

Findings 6-11 read the OPERATION layer: `readState` composes them (`check-layer.mjs`), `checkState` appends them after
its own five, and a vault with no `operations/` file and no map produces the bytes it produced before these layers
(`check-operation.test.mjs`, `report-check.test.mjs`). Decisions, cell R5: a ✔ operation is exempt from findings 6-11
(its pack expired; an append-only entry cannot be rewritten); a non-numeric `spend ceiling` or `Spend` is SKIPPED,
never guessed; the merge range starts at the opening entry's TIMESTAMP (INFERRED, `git log --since`).
**Without git, or outside a work tree, `cell-stale` and `merge-unrecorded` are UNKNOWN**: one NOTICE line on stderr
(`cellmode check · UNKNOWN: …`), never silence and never a pass — and deliberately NOT a finding, which would leave
every vault in a plain directory red with nothing to fix. When git DOES answer, an UNKNOWN answer IS a finding.

The log is truth and only ever **appended** (`fs.appendFileSync`); every other file is a projection, and the log wins.

## Modules

Pure logic is separate from filesystem access: `state.mjs` is the only module that opens a vault file.

| File | Role |
|---|---|
| `cli.mjs` `main.mjs` | Entry point (sets `process.exitCode`), then dispatch and usage text — `main` returns an exit code instead of exiting. |
| `commands.mjs` | `init`, `plan`, `park`, `status`, `check`, the command registry, and the one branch that picks the in-operation transition. |
| `operation-commands.mjs` | `op open`, `op pause`, `op complete`, `op status`; `operation-lookup.mjs` answers which operation a command means and holds the refusals, `operation-log.mjs` renders their log entries. |
| `transitions.mjs` `activate.mjs` | `open`, `resume`, `pause`, `complete` with no operation active, the shared closing path, the integrity guard, the one-active-cell refusal and the activation write path. |
| `cell-in-operation.mjs` | The same four transitions inside a 🔵 operation; `-rules.mjs` holds the added rules (ceiling, planned cells, boundary, the crossing, which 🔵 cell a `[name]` means), `-state.mjs` the base commit and the pack amendment (composed from `state.mjs`). |
| `conflicts.mjs` | The mechanical crossing: path overlap, `NOT in:` holes, shared resources, the table, and the `**Conflicts:**` record. |
| `state.mjs` | All filesystem I/O for `vault/state/`. |
| `index-table.mjs` `log.mjs` `cell-file.mjs` | Parse/render `INDEX.md` (escaped pipes, link-form names, several tables), the log entries (append-only by construction) and `cells/<slug>.md`. |
| `operation-file.mjs` | Render/parse `operations/<slug>.md`, the pack and the finish-line fingerprint — pure. |
| `projections.mjs` | `CURRENT-CELL.md` (header, active-cells table) and the reconnection/summary text. |
| `check.mjs` | The integrity guard and the ceiling, PURE — it opens no file and starts no process, which is what lets the Observer import it as the one integrity verdict. `check-operation.mjs` holds the four operation rules (pure), `check-git.mjs` the two git ones (read-only `git`, argv array, no shell), `check-layer.mjs` composes them from the reads `state.mjs` injects. `skeleton.mjs` is the empty state, shared with `templates/vault/state/`. |
| `report-command.mjs` | `report`: it reads through `state.mjs`, then `report-model.mjs` (vault → plain object) and `report-svg.mjs` (object → SVG string) — both PURE — answer the file; `check-report.mjs` holds `map-stale`. |
| `clock` `paths` `slug` `fields` `args` `errors` | Small pure helpers; `helpers.mjs` is test plumbing, not a test file. |

## Operation files and the `op` family

`operation-file.mjs` is the data model of `vault/state/operations/<slug>.md` and the `op` commands are its command
surface. Still **not** built: the spend roll-up to `Spend so far` (the guard reads the cells' own `Spend` instead).
The model exists so the hand-written file and the command cannot drift apart. The format is in
`docs/03-state-and-memory.md` §3; `parseOperationFile` / `renderOperationFile` round-trip it and `parsePack` /
`renderPack` do the pack line alone. The pack's vocabulary is **closed** —
`PACK_GRANTS`: `spend ceiling`, `publisher`, `batches` (each `op → limit`; a batch with no limit is rejected),
`requires-yes`, `denied`, `max-active-cells`; any other key throws `PACK_UNKNOWN_GRANT: <key>` and every name in
`PACK_FORBIDDEN_GRANTS` (the `skip-*` family, `destructive*`, the protected resources, `force-push`, `delete-data`,
`schema-change`) throws `PACK_FORBIDDEN_GRANT: <key>`. `fingerprintFinishLine` is sha256 over the finish line
normalized (numbering dropped, whitespace collapsed, trimmed, lowercased, sorted): reordering or renumbering the same
items keeps it, a reworded, added or removed item changes it.

`op open` freezes the finish line: `--finish-line "a; b"` is split on `;` (or `·`), numbered and fingerprinted, and
**resuming a ⏸ operation may not move it** — a different fingerprint for the same slug is exit 1, not a new opening.
`--pack` is the field value itself: ` · ` between grants, `;` between batches (a `;` immediately before a known grant
key is a grant separator too); a pack error exits 1 with the model's own named error.

Each opening, pause, completion, pack amendment and conflict crossing appends its own entry under `## <stamp> ·
Operation: <name>`, always with the `Status`, the frozen `Finish line` and the `Fingerprint` — repeated in every
entry, which is what `finish-line-moved` compares against. The heading says `Operation:` where a cell entry says
`Cell:`, so `parseLog` reads only cell closures and `check-operation.mjs` reads these. **`op pause` does not cascade
to the cells** (decision, R3): a cell pause needs its own facts and next step and the CLI will not invent them, so `op
pause`/`op complete` with a 🔵 cell of it is exit 3 ("pause the cell first") rather than fiction in the log. The
operation header above the cell projection carries no `**Key:**` field, so the cell below parses as before, and the
cell file's three OPTIONAL fields for this layer — `**Operation:**`, `**Base commit:**`, `**Spend:**` — are rendered
only when set, so a cell file written before this layer round-trips byte for byte.

## Tests

`npm test` runs the repo and `node --test "tools/cellmode/**/*.test.mjs"` runs this tool only — positional arguments
to `node --test` are globs, not directories, so the pattern is quoted. Each test runs in a fresh temporary directory
and drives the real CLI in a child process with a fixed clock: the assertions are about files on disk, not mocks
(`check-git.test.mjs` builds its history with git PLUMBING only, never a checkout).

## Addition to the original protocol

`**Status:** ⏸ | ✔` in the log entry is **new**: the original format left the closing status implicit in prose, and
making it a field is what lets `check` compare the log against `INDEX.md` mechanically. `templates/vault/state/` holds
byte-identical copies of what `init` writes, for adopters who prefer to copy a folder; a test asserts they stay equal.
