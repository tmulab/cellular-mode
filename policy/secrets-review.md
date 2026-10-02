# R-2 review — the four allowlisted files, measured one by one

**Decision of 2026-10-02 (Hudson A. R. Bonomo): R-2 is NOT APPROVED.** Each of the
four entries in `secrets-allowlist.json` had to be reviewed on its own, narrowed to
the smallest form the gate can express, and removed if it was not needed at all.

This document is the review. The outcome is that **all four entries are gone**: the
allowlist is now the empty array, and the project holds **zero** secret-scan
exceptions. The relaxation that needed approving no longer exists.

## How the measurement was made

The scanner is a pure function, `checkSecrets(files, allowlist)`, so no file had to
be edited and no temporary copy of the repository was needed: the same tuples the
CLI reads were passed to the same function with the allowlist replaced by `[]`.
The repository was never modified to take the measurement.

- Scope read: **213 text files**, **8 detector rules**.
- `checkSecrets(allFiles, [])` → **0 findings**.
- Positive control (same call, one fragment-assembled model-provider key shape
  seeded into an in-memory copy of `tools/gates/secrets.mjs`) → **1 finding**. The
  zero above is a measurement, not a scanner that answers zero to everything.

| File | Lines scanned | Findings with its entry removed | Rules triggered |
|---|---|---|---|
| `tools/gates/secrets.mjs` | 118 | **0** | none |
| `tests/leaks.test.mjs` | 100 | **0** | none |
| `policy/secrets-allowlist.json` | 26 (before emptying) | **0** | none |
| `tools/gates/README.md` | 194 | **0** | none |

## File by file

### `tools/gates/secrets.mjs` — the scanner

**Why an exception looked necessary.** It is the rule book. A file that lists the
shapes of credentials is the most obvious candidate for a scanner that flags its
own definitions, and a gate that trips on itself teaches people to add exclusions
until it is quiet.

**What it contains.** Regular-expression *fragments* — two-to-six-character pieces
of prefixes and character classes, joined at runtime by a helper — plus the prose
names of the eight detector rules and a one-line human explanation of each
("private key block", "chat-platform token"). No literal credential, no literal
prefix: every shape exists only after `Array.prototype.join` runs.

**Does it trigger today?** **No. 0 findings** across all 8 rules. The
fragment-assembly technique already solves the problem that the entry was written
for, which makes the entry redundant rather than wrong.

**Narrower form possible?** Not needed — **entry removed**. The protection that
remains is structural (fragments, not literals) and it is tested: `gates.test.mjs`
asserts that the gate reports nothing when run over its own source.

### `tests/leaks.test.mjs` — the hygiene test

**Why an exception looked necessary.** Same reasoning inherited from the scanner.

**What it contains.** Fragment-assembled *privacy* needles (an OS account name, home
directory prefixes, private project names) and two regular expressions for an
e-mail address and a code name. The credential shapes are no longer duplicated
here at all: the test imports `checkSecrets` from the gate.

**Does it trigger today?** **No. 0 findings.**

**Narrower form possible?** Not needed — **entry removed**.

### `policy/secrets-allowlist.json` — this policy's own data file

**Why an exception looked necessary.** It names rules and paths in prose, and a
self-referential hit would be impossible to ever clear: silencing the file that
grants silence.

**What it contains.** Now: an empty JSON array. Before: four objects with a `path`,
a `rule` of `*`, a prose rationale, and the string `PENDING HUMAN APPROVAL`. Rule
names in plain text — never a credential, never a quoted literal that looks like
one.

**Does it trigger today?** **No. 0 findings**, measured against the 26-line version
that still carried all four entries, so the answer does not depend on the file
having been emptied.

**Narrower form possible?** Not needed — **entry removed**. Residual risk, named: a
future rationale that quotes a credential-shaped literal would now be reported.
That is the correct behaviour, not a regression.

### `tools/gates/README.md` — the gates documentation

**Why an exception looked necessary.** It describes the detectors for a human
reviewer, in English prose.

**What it contains.** Prose descriptions of what each gate proves and does not
prove, a table of automated versus human-review items, and the names of the rules.
No sample credential, by choice: the document describes shapes in words.

**Does it trigger today?** **No. 0 findings.**

**Narrower form possible?** Not needed — **entry removed**.

## What changed in the gate

No change to the matching logic — none was required. `rule: '*'` was never
narrowed to a line or a match hash, because **there is no remaining entry to
narrow**: adding a line-scoped or hash-scoped form would have been untested
machinery for a case that does not exist. The forms the gate already expresses,
from narrowest to widest, are: exact `path` + exact `rule` · exact `path` +
`rule: '*'` · directory `path` (trailing `/`) + `rule`. **PROPOSED**, if a real
exception ever appears: add `line` and `matchHash` fields and prefer them over
`'*'`, tests first.

What did change is visibility, in `tools/gates/release.mjs` (pure) and
`check-all.mjs` (the shell):

- Every run of `npm run gates` ends with the pending-exception count —
  `✅ pending exceptions: 0` today, or `⚠️ N pending exception(s) honoured for
  development, NOT approved:` with one addressed line each.
- Pending entries are still **honoured** by the day-to-day gates. Failing on them
  would make every change red and train people to pass `--force`; printing them
  with a count keeps them visible and keeps the gate useful.
- `node tools/gates/check-all.mjs --release` **exits 2** on any pending exception,
  on any relaxation that is not `APPROVED` or `WITHDRAWN`, and while the typecheck
  leg is UNAVAILABLE. Only `APPROVED` and `WITHDRAWN` resolve a relaxation, so
  R-1's `ACCEPTED (development only)` status is release-blocking by construction.

A status this gate does not recognise is `UNKNOWN`, and `UNKNOWN` blocks. Tests:
`tests/gates-release.test.mjs` (11 cases, in-memory fixtures plus two that spawn
the CLI), each proven red by mutation.

## Verdict

**R-2 is WITHDRAWN**, not approved: the relaxation was found to be unnecessary and
the thing it excused has been deleted. See `policy/relaxations.md`.
