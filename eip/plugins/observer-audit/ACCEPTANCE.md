# Acceptance criteria — `observer.audit` (Stage 3, Cell 2 · the auditor)

Written **before** the code. Each criterion is binary and addressed by a test;
mutation-proved where noted. Labels: VERIFIED (ran it) / INFERRED / PROPOSED / UNKNOWN.

## Scope

The auditor is an **optional plugin** that judges this repository against rules that
already exist. It re-implements none of them: the vault verdicts come from the
`tools/cellmode` pure modules through `observer.state`, the static verdicts come from
the `tools/gates` pure functions, and the typecheck/build/tests verdicts come from an
EVIDENCE FILE written by the gate that actually ran them. It reads; it never writes,
never spawns a process and never performs an action it suggests.

## Status vocabulary (binding)

| status | means | may be claimed when |
|---|---|---|
| `PASS` | the rule was evaluated and holds | the inputs the rule needs were all present |
| `FAIL` | the rule was evaluated and is broken | a gate returned a finding, or an evidence leg failed |
| `WARNING` | something is wrong that is not a gate breach | a contract field is missing, a dependency dangles, evidence is stale |
| `UNAVAILABLE` | the rule could NOT be evaluated | the evidence file is absent, or a policy file is unreadable |
| `NOT_APPLICABLE` | the rule has nothing to judge here | no `ACCEPTANCE.md` carries the checkbox convention |

`UNAVAILABLE` is never counted, rendered or summarised as `PASS`. That is the single
most important sentence in this file: a dashboard that shows a green tick for a leg
nobody ran is the exact failure the constitution's Trilateral rule exists to prevent.

`Finding = { id, scope, rule, status, evidence: string[], explanation, action? }`
with `scope` either `'project'` or `cell:<id>`, and `id` of the form
`AUD-<RULE>-<nnn>` — deterministic: findings of one rule are ordered by their key
(`scope` then first evidence line) and numbered from 001, so the same inputs always
produce the same ids.

## Criteria

### Registration, privilege and residue

- **A1** `observer.audit` passes `definePlugin`, declares `permissions: ['fs.read']`,
  `inject: { 'observer.state': { required: true } }` and exactly two capabilities,
  `run-audit` and `findings`; both are `consequential: false` — auditing is reading.
- **A2** The plugin sees exactly the four `fs.read` ports (`readRepoFile`,
  `listRepoFiles`, `readEvidence`, `readHead`) plus the vault readers of the same
  permission. A `writeFile` port the host also offers is **invisible**, and no port
  that could spawn a process exists anywhere in the composition. Mutation-proved by
  asking from inside the plugin.
- **A3** The last audit is held in memory only and `dispose` clears it: afterwards
  `findings` reports "never run" again. Running a full audit over a real vault and
  repository leaves every file under `vault/state/` and every file of the repository
  byte-identical (SHA-256 tree before and after), and a host composed WITHOUT the
  plugin leaves the same hashes.

### Classification (pure, per rule)

- **A4** `cell-state` reuses the `tools/cellmode/check.mjs` verdict carried by the
  `observer.state` model: no integrity finding ⇒ one `PASS`; each finding ⇒ a `FAIL`
  whose evidence names the finding's own code. No second implementation of the guard.
- **A5** `cell-contract` checks, per cell, that objective, boundary, done criterion and
  next step are recorded. Active and paused cells need all four; a **done** cell with
  `—` as its next step is correct and yields no finding. A missing field is a
  `WARNING` with `scope: 'cell:<id>'` naming the field. Mutation-proved: a done cell
  with no next step must NOT produce a finding, and an active one must.
- **A6** `dependencies` reports each dangling declared dependency as a `WARNING` on the
  declaring cell; an undeclared pair is never inferred into an edge or a finding.
- **A7** `file-size`, `secrets`, `deps` and `import-boundaries` are the `tools/gates`
  pure functions applied to the files the port supplied: every gate finding becomes one
  `FAIL`, and an empty gate result becomes one `PASS`. On a fixture the auditor's
  findings mirror the gate's own output one for one.
- **A8** A `secrets` finding carries **only** the rule id and `path:line`. The matched
  text never appears in any field of any finding. Mutation-proved: a fixture containing
  a credential-shaped literal produces a finding, and the literal is absent from the
  serialised result.
- **A9** `acceptance-criteria` reads `ACCEPTANCE.md` files and judges exactly one
  convention — the GFM checkbox: `- [ ]` is an open criterion, `- [x]` is a closed one.
  Unchecked boxes ⇒ `WARNING` per file. No `ACCEPTANCE.md` at all, or none carrying a
  checkbox, ⇒ `NOT_APPLICABLE` — never `PASS`, because "all criteria have a verdict" is
  not something this check measured.
- **A10** `done-evidence` reports a `WARNING` for a cell marked done whose last log
  entry records no `Build` field, or records a build that reads as failed.

### Evidence legs (never a PASS without execution evidence)

- **A11** With no evidence file, `typecheck`, `build` and `tests` are each
  `UNAVAILABLE` with an action naming `npm run trilateral -- --evidence`, and the
  summary counts them under `UNAVAILABLE`. Mutation-proved: a test that would also pass
  if the status were `PASS` is not a test, so the assertion is on the exact status AND
  on `summary.PASS` being 0 for those rules.
- **A12** A leg recorded as failed is `FAIL`; a leg recorded as a warning (the gate's
  own UNKNOWN, e.g. no type checker resolved) is `UNAVAILABLE`, never `PASS`.
- **A13** `evidence-freshness` is a `WARNING` when the evidence `head` differs from the
  repository's current head, or when the evidence is older than the newest source file;
  `PASS` when neither holds; `UNAVAILABLE` when there is no evidence file.
- **A14** The evidence file itself is written only by
  `node tools/gates/trilateral.mjs --evidence`, from the results it actually computed,
  with `schema: 1`, an ISO `at`, a `head` read from `.git` without spawning a process
  (`null` when unreadable) and the three legs with their real counts. `.cellular/` is
  gitignored. Nothing synthesises a leg it did not run.

### Capabilities

- **A15** `run-audit {}` answers `{ at, findings, summary }` where `summary` has one
  non-negative integer per status and `summary` totals equal `findings.length`.
- **A16** `findings { status?, scope? }` filters the LAST result. Never run ⇒ one
  `UNAVAILABLE` finding (`ran: false`) telling the caller to run `run-audit`, never an
  empty `PASS`. An unknown `status` or a malformed `scope` ⇒ `INPUT_INVALID` (HTTP 400)
  with `details[0].path` naming the field; an extra property ⇒ `INPUT_INVALID` at the
  kernel gate.
- **A17** No response contains an absolute path or raw file text: evidence lines are
  repository-relative addresses, and `action` is a sentence a human may act on — the
  plugin never performs it.
- **A18** `api/openapi.json` documents both capabilities in the SDK schema subset and
  real HTTP responses validate against those schemas; the existing route contract test
  stays green because no new path is invented.

### Confinement of the repository reader

- **A19** `readRepoFile` refuses, with `PERMISSION_DENIED`: an absolute path, a
  drive-letter path, `..` traversal, a NUL byte, a backslash, a dot-leading segment, a
  symbolic-link or junction escape, and a file larger than the cap. `listRepoFiles`
  never lists `.git/`, `node_modules/`, the hash-pinned vendored artefacts, or any
  name the shared segment rule refuses — one exclusion list, shared with
  `tools/gates/scan.mjs`. Mutation-proved on each shape.
- **A20** `readEvidence` can reach exactly one file, `.cellular/evidence/trilateral.json`,
  and answers `null` when it is absent or not valid JSON of `schema: 1`.
