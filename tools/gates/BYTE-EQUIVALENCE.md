# Byte equivalence — the bytes verified are the bytes committed

A companion to [`FINAL-VERIFICATION.md`](FINAL-VERIFICATION.md): Article 8 says a cell may not
be completed on verification obtained before its last modification. That rule assumes the
state the suite READ and the state git would COMMIT are the same bytes. They are not, by
default — there is a filter in the middle.

## The chain, stage by stage

| Stage | What it holds | Who looks at it |
|---|---|---|
| working-tree bytes | what the editor wrote | `fingerprint.mjs` hashes these; the suite reads these |
| clean / eol filters | `.gitattributes` (here: `* text=auto eol=lf`, `apps/observer/vendor/** -text`) and `core.autocrlf` | `git add`, `git status`, `git hash-object` without `--no-filters` |
| index blob | the FILTERED bytes, content-addressed | `git write-tree` |
| staged tree | the tree a commit would record | `pre-commit`, `authorization.mjs commit` |
| commit tree | the tree the commit DID record | `commit-msg` trailer, CI (`ci-trailer.mjs`) |

A record binds a **fingerprint** (stage 1) to a **tree** (stages 4–5). With `eol=lf` and a
CRLF working copy, stage 1 and stage 4 hold different bytes for the same path — and both
numbers in the record are correct about different things.

## The false equivalence that existed

Until 2026-10-04 nothing checked that the two stages agreed, and they did not: 16 of 608
tracked files in this repository had working bytes different from their committed blobs (CRLF
versus LF). Consequences, stated plainly:

- `npm run verify:final` ran the suite over bytes that **no commit would ever contain**.
- The `Verified-State` trailer named the normalised tree — so the trailer was true about the
  tree, while the suite had never seen that tree's content.
- CI, which checks out LF on Linux, failed two tests that were green on this machine
  ([`CI.md`](CI.md)). The failures were real and the local green was real; the equivalence
  between them was the fiction.

Nothing was fabricated. The gap was an **assumption nobody had written down**, which is the
kind of defect this project treats as a gate, not as a lesson.

## The check

`tools/gates/byte-equivalence.mjs`, run by `verify-final` BEFORE the mandatory suite, over
exactly the controlled set `fingerprint.mjs` hashes. Two batch invocations of git — never one
per file:

```
git hash-object --no-filters --stdin-paths     # raw: the bytes as they sit on disk
git hash-object --stdin-paths                  # filtered: the bytes git would store there
```

Both read paths from stdin, one per line, with the attributes of each path applied on the
filtered side — which is exactly what `git add` would do. Equal for every path, or the run
refuses. Properties worth naming:

- **FAIL CLOSED.** A git command that does not exit 0, a count git did not return, or a path
  containing a line break (which `--stdin-paths` cannot carry) is an ERROR. "Could not
  compare" is never "equal".
- **No false positives on binaries or vendored files.** A path with `-text` has no filter to
  apply, so raw and filtered are equal by construction; the check costs it nothing.
- **Addresses, not adjectives.** A refusal states the count and lists the paths — up to 50 of
  them, in the record and on the terminal alike — then prints the remedy.
- **It refuses; it never repairs.** Rewriting a human's working file is not a gate's job.

### The remedy it prints

```
git add -A && git checkout -- <files>     # restore the working copy from the index
                                          # (or set the editor to LF), then:
npm run verify:final
```

For a repository already drifted, the method that cannot change a single blob is to write the
index bytes back over each working file — `git cat-file blob :<path> > <path>` — then confirm
with `git diff --name-only` that no content changed. That is how the 16 files above were
restored; `git status` may keep showing them until the index stat cache is refreshed
(`git update-index --refresh -- <files>`), which is a cache, not a content difference.

## What it changes in the evidence

A record now carries `equivalent` (boolean) and, on a refusal, `drifted` (the paths):

```json
{"schema":"cellular-final-verification/1","at":"...","fingerprint":"<64 hex>","tree":"<40 hex>",
 "checks":[],"ok":false,"reason":"the working bytes of 1 of 613 controlled file(s) are not the
 bytes git would commit: docs/guide.md","equivalent":false,"drifted":["docs/guide.md"]}
```

`authorizes()` in `final-evidence.mjs` requires `ok: true` **and** `equivalent: true`, so the
same rule answers the CLI (`npm run authorized`), `pre-commit`, `commit-msg` and `pre-push`.

**Compatibility policy.** Records written before this check existed have no `equivalent`
field. They remain READABLE — the evidence file is append-only and the history is not rewritten
— and they authorize NOTHING: a missing field is not a measured equivalence. `treeAuthorized`
says which of the two cases it is, so the refusal is actionable rather than mysterious.
Commits already pushed are unaffected, because CI's trailer check compares a commit's trailer
with its own tree and never reads a local record.

## The stronger alternative, assessed and not chosen

Run the suite in a clean worktree created from the exact staged tree (`git worktree add`, or
`git archive` of the index into a temporary directory).

- **For:** exact by construction. The tested bytes ARE the bytes that would be committed; no
  comparison, no filter reasoning, no trust in attributes.
- **Against:** a second `node_modules` per run (minutes and gigabytes, or a shared install that
  reintroduces a difference); it verifies what was STAGED, so a partially staged change is
  verified as a state the human never had on disk; a failure points at a path inside a
  temporary copy, which makes the report harder to act on; and `.cellular/` would have to be
  written outside that worktree anyway.
- **Chosen:** the equivalence check. When raw and filtered bytes are identical for every
  controlled path, the working tree IS the staged content, so the two approaches certify the
  same thing — one for two git invocations, the other for a full install per run. Equal
  strength, two orders of magnitude apart in cost.
- **Still open:** the worktree form belongs in CI, which already runs the whole mandatory
  suite on a clean server-side checkout and therefore gets the exactness for free.

## Mutation proofs (each applied, observed red, reverted)

| Guard | Mutation | Observed red |
|---|---|---|
| the comparison is raw **against** filtered | `checkByteEquivalence` passes `filters: true` on both sides | `CRLF working bytes under eol=lf are reported, by path` + `verify:final REFUSES before the suite runs…` |
| the check actually runs | `verify-final` replaces the call with `{ equivalent: true, differing: [] }` | `verify:final REFUSES before the suite runs, then authorizes once LF is restored` |
| a record without the result authorizes nothing | `authorizes()` returns `record.ok` alone | `a record with no 'equivalent' field stays readable but authorizes nothing` |
| the policy loader normalises | `canonicalPolicy` becomes the identity function | 3 red in `tools/adaptive/policy-bytes.test.mjs` + `context · the byte sizes recorded in README.md…` |
| a path git cannot be asked about fails closed | `unsafeForStdin` returns `[]` | `unsafeForStdin · a path git cannot be asked about line by line is refused, not skipped` |

## Tests

`tests/gates-byte-equivalence.test.mjs`, in throwaway repositories built by
`tests/git-fixture.mjs` (never in this one): the pure comparison and its fail-closed cases; a
clean checkout; a `-text` file with CRLF that must NOT be reported; a CRLF file under `eol=lf`
that must be reported by path; `verify-final` refusing BEFORE the suite runs (asserted with a
suite that records whether it was asked to run) and authorizing once LF is restored; a record
without `equivalent` that parses but authorizes nothing; and a change staged after verification
that is still refused.
