# The Trilateral evidence record

`node tools/gates/trilateral.mjs --evidence` (or `npm run trilateral -- --evidence`) writes
`.cellular/evidence/trilateral.json`. This file is the contract between the gate that RUNS the
three legs and a reader that cannot. Pointed at from [`README.md`](README.md).

## Why it exists

The constitution forbids claiming a result that was not executed. `observer.audit` reports
typecheck, build and tests — and it has no port that spawns a process, deliberately, so it
cannot run any of them. There were two honest options: give the auditor the power to execute
things, or give it a record of what was executed. The second one costs less and takes nothing
away: an auditor that can start processes is an auditor whose read-only claim rests on
discipline instead of on construction.

So the gate writes what it measured, and the auditor reads it and says UNAVAILABLE when there
is nothing to read.

## Shape (`evidence.mjs`, version `schema: 1`)

```json
{
  "schema": 1,
  "at": "2026-10-02T10:00:00.000Z",
  "head": "edd6db4953142513b9d38f13db0a79714ebb0799",
  "legs": {
    "typecheck": { "status": "pass", "detail": "typecheck: tsc --noEmit -p jsconfig.json — 0 error(s)", "errors": 0 },
    "build":     { "status": "pass", "detail": "build: … 181 modules imported", "modules": 181 },
    "tests":     { "status": "pass", "detail": "tests: 443 passed, 0 failed, 443 total", "passed": 443, "failed": 0, "total": 443 }
  }
}
```

- `status` is the leg's own vocabulary: `pass`, `fail`, `warn`. `warn` is the GATE saying it
  could not verify (no type checker resolved, for instance) and is the reason the auditor maps
  it to UNAVAILABLE rather than to PASS.
- Every number comes from the leg that measured it. A count the reporter could not parse stays
  `null`, and a leg that measures nothing carries no number at all — never a `0` standing in
  for an unknown.
- `head` is read from `.git/HEAD` and the ref it names (loose or packed) by `git-head.mjs`, as
  FILES. No process is spawned, here or anywhere in this path, and an unreadable repository
  gives `null` — which means "unknown", never "unchanged".
- `at` is an ISO timestamp. It is what staleness is measured against.

## How a reader must treat it

`parseEvidence` fails closed: anything it cannot fully recognise — a future `schema`, a missing
leg, an unknown status, an unparsable `at` — answers `null`, and `null` means UNAVAILABLE. A
half-understood record becoming a green leg is worse than no record at all.

The auditor's rules, stated once so both sides can be tested against this page:

| situation | `observer.audit` answers |
|---|---|
| no record | `typecheck`, `build`, `tests`, `evidence-freshness` all UNAVAILABLE |
| leg `pass` | PASS |
| leg `fail` | FAIL |
| leg `warn` | UNAVAILABLE — a gate that cannot run is never green |
| `head` differs from the tree's commit | `evidence-freshness` WARNING (stale) |
| record older than the newest `.mjs`/`.js`/`.cjs`/`.ts` file | `evidence-freshness` WARNING (stale) |
| `head` unknown on either side | `evidence-freshness` WARNING — unestablished is not PASS |

Source means CODE (`observer-audit/sources.mjs`): a document edited after the run does not
invalidate a test run, and treating it as if it did would train people to ignore the warning.

## Why it is gitignored

`.cellular/` is in `.gitignore`, and `.cellular` is on the gates' own exclusion list
(`exclusions.mjs`), for the same two reasons. The record describes ONE machine at ONE moment,
so committing it would turn a local measurement into a claim about everybody's checkout; and a
gate whose set of scanned files depended on whether somebody had run `--evidence` first would
be a gate nobody could reproduce.

The record is therefore never evidence *for* a release. It is evidence for a reader on the
machine that produced it, and the freshness rules above are what keep it from outliving that.
