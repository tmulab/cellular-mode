# Acceptance criteria — `observer.state` (Stage 3, Cell 1 · backend)

Written **before** the code. Each criterion is binary, addressed by a test, and
mutation-proved where noted. Labels: VERIFIED (ran it) / INFERRED / PROPOSED /
UNKNOWN. This file states the contract; `OBSERVER_STATE.md` claims nothing.

## Scope

The observer is an **optional plugin** on the existing SDK/kernel/host. It reads the
vault through host-granted read ports and parses it with the `tools/cellmode` pure
modules — never a second parser, never a write port, never an absolute path on the
wire.

## Error vocabulary (binding on the frontend)

A CLIENT error is the plugin's own answer to give, so the kernel passes the two
`PASSTHROUGH_CODES` through with their code, message and `details` (K14 in
`eip/kernel/ACCEPTANCE.md`), and the host maps them by its existing table:

| Logical outcome | HTTP | `error.code` |
|---|---|---|
| unknown cell id | 404 | `NOT_FOUND` |
| id fails `^[a-z0-9-]{1,80}$` | 400 | `INPUT_INVALID` |
| id wrong type / empty / >80 chars / absent / unknown property | 400 | `INPUT_INVALID` |

`details[0].path` is `"id"` in every case. The SDK schema subset has no `pattern`
keyword by design, so the charset half of the id contract is checked in the plugin
rather than at the kernel gate; the code a caller sees is the same either way. What
the plugin still CANNOT do is claim authority: a thrown `APPROVAL_*` or
`PERMISSION_DENIED` is contained as `PLUGIN_ERROR`, proved in
`eip/kernel/containment.test.mjs`.

## Criteria

### Registration and lifecycle

- **O1** `observer.state` passes `definePlugin`, declares `permissions: ['fs.read']`
  and exactly the five capabilities `overview`, `cells`, `cell-detail`, `graph`,
  `timeline`; every one of them is `consequential: false`.
- **O2** The plugin sees exactly the ports whose permission it declared: `readVault`
  and `listCells` are present, and a `writeFile` port offered by the host is
  **invisible** (least privilege by construction, not by discipline).
- **O3** `load` then `dispose` leaves zero residue: the in-memory call counter is
  cleared by its inverse effect, the service is gone from the kernel, a call answers a
  real `NOT_FOUND` (the kernel's, not a contained throw), a second `dispose` is
  refused with `NOT_FOUND`, and the manifest stays *registered* — dispose is
  reversible, not destructive. The vault itself is re-read on every call: there is no
  cache to go stale, because a dashboard showing a cached project lies quietly.

### State reading (temp vaults created by the real CLI)

- **O4** `overview {}` answers `{counts:{total,planned,active,paused,done}, active,
  recent (≤5), warnings, integrity}` with counts that match the vault the CLI wrote.
- **O5** `cells {}` answers one `CellSummary` per `INDEX.md` row, with `status` as a
  word, `statusSymbol` as the protocol symbol, and `dependencies` taken **only** from
  the cell file's `**Dependencies:**` field, as slugs.
- **O6** `cell-detail {id}` answers every declared field, `null` for a field the vault
  does not carry, and lists each such field in `unavailable`. An unknown id answers
  `NOT_FOUND` (per the table above) and never touches the filesystem: the id is
  resolved against the parsed index, never concatenated into a path.
- **O7** A malformed `id` answers `INPUT_INVALID` (HTTP 400) whichever gate caught it:
  the kernel's schema gate for type/length/absence/extra property, the plugin's own
  throw for the charset. An unknown id answers `NOT_FOUND` (HTTP 404). The two are
  genuinely different codes, and neither is a 500. Mutation-proved.
- **O11** `integrity` is the verdict of the `tools/cellmode/check.mjs` pure function —
  the same guard the CLI runs — not a re-implementation.

### Graph

- **O8** Edges exist **only** between declared dependencies. An undeclared pair is no
  edge; a dependency naming an unknown cell is reported in `dangling` and in
  `warnings`, never invented as a node. Mutation-proved.
- **O9** Layout is deterministic and server-side (the scene computes nothing): the
  same vault yields byte-identical positions across runs and across processes.
  `node.column` is the **integer index into `layout.columns`** (0..3; `columns` is
  always all four protocol statuses, so a column never moves when a cell changes
  status), `node.layer` is the longest declared dependency path, and the position is
  pure arithmetic on `(column, layer, rank)` — pinned in the schema and in
  `api/openapi.json` as `integer, minimum 0, maximum 3`. ~500 cells complete within
  the declared bound, and the cost is linear in nodes + edges (no all-pairs pass).

### Timeline

- **O10** Events come from `log.md` **only**. `notRecorded` is exactly
  `['open','resume']`: the protocol does not log them and the plugin never
  synthesises them. `limit` (1..500, default 100) and `cell` are validated; the
  newest events are returned.
- **O18** ONE status vocabulary across the whole contract. `CellSummary.status`,
  `GraphNode.status` and `TimelineEvent.status` are all the WORD
  (`planned|active|paused|done`), with the literal protocol symbol alongside in
  `statusSymbol`; `cell-detail.evidence.lastStatus` is the same word. A symbol the
  protocol does not define yields `status: null` and `kind: 'reconstructed'` — never an
  invented word. A caller can render `status` verbatim without knowing which
  capability produced it.

### Confinement and read-only guarantee

- **O12** The read port refuses, with `PERMISSION_DENIED`: a name outside the declared
  set, a path separator, `..`, an absolute path (POSIX or drive-letter form), a NUL
  byte, a `cells/<slug>` whose slug breaks `^[a-z0-9-]{1,80}$`, and a target that is a
  symbolic link or a junction escape. Mutation-proved.
- **O13** The plugin is **read-only in bytes**: a full API session over every
  capability leaves every file under `vault/state/` with an identical SHA-256, and a
  host composed without the plugin leaves the same hashes. Removing the plugin
  removes the feature and nothing else.
- **O14** No response contains an absolute path: scanned for drive-letter forms, for
  the host root and for the temp-dir prefix, over the JSON of every capability.

### Contract

- **O15** `api/openapi.json` documents the five capabilities (input and output) in the
  SDK schema subset, and real HTTP responses validate against those schemas. The
  existing OpenAPI contract test stays green: the five capabilities are reached
  through the one generic capability path, so no new `paths` entry is invented.

### CLI extension (`--deps`)

- **O16** `cellmode open` and `cellmode plan` accept `--deps "<a>, <b>"` and write the
  cell file's `**Dependencies:**` field. Values are **normalised to slugs**
  (`slugify`), de-duplicated, order preserved; an empty list writes `—`. No other
  lifecycle behaviour changes, and no log entry is added or removed.
- **O17** `--deps` is rejected on every other command (`unknown option --deps`), and an
  omitted `--deps` never erases a `Dependencies` field already in the cell file.
  Mutation-proved.
