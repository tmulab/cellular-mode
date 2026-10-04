# Independent CI verification

**Status: THE FIRST REMOTE RUN FAILED. CORRECTED; THE SECOND RUN HAS NOT HAPPENED.** The
workflow [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml) ran on GitHub for
the first time and did its job: it found a real defect this machine could not see. The
correction is described below. Everything claimed about the workflow's *shape* is VERIFIED by
[`tests/ci-workflow.test.mjs`](../../tests/ci-workflow.test.mjs) and
[`tests/ci-workflow-matrix.test.mjs`](../../tests/ci-workflow-matrix.test.mjs) on this machine;
the *result* of the corrected workflow is UNKNOWN until it runs remotely again.

## The first run, and what it found (run `37185128292`)

VERIFIED (the run's own log): `ubuntu-24.04`, Node `22.23.3`, failed at the step
**`build (module load)`** with `tests: 989 passed, 2 failed, 993 total` and **not one test
name**. Three separate defects, one symptom:

1. **The step ran more than one leg.** `trilateral.mjs` runs typecheck, the module-load gate
   *and* the whole suite, so a failing TEST was reported as a failing BUILD, and the reporter
   output was swallowed. **Corrected:** the build step is now
   `node tools/gates/trilateral.mjs --legs typecheck,build`, and the suite has its own step,
   `node --test --test-reporter=spec 2>&1 | tee "$RUNNER_TEMP/tests.log"`, which names every
   failing test in the log.
2. **The counts did not add up, and nothing said so.** 989 + 2 is 991, not 993: two results
   were neither passed nor failed. They were **CANCELLED** tests, and the parser did not read
   `cancelled`, `skipped` or `todo` at all. **Corrected:** [`test-counts.mjs`](test-counts.mjs)
   reads all six numbers, `countsProblem` FAILS the leg when the parts do not reach the total
   and when `cancelled > 0` — a cancelled test did not run, so it is never a pass.
3. **The defect itself.** `eip/plugins/observer-advisor/call-model.mjs` called `unref()` on its
   deadline timer. With a never-answering adapter the model call was the only pending work, so
   Node judged the loop idle and tore it down before the deadline could fire: the promise could
   never settle, and `node --test` on **Node 22** cancelled the two tests that exercise it
   (`V20`, `V21`). On **Node 24** the same code passed — which is why only CI saw it.
   **Corrected:** the timer stays ref'd and is cleared in `finally` on every path, and a signal
   that was already aborted is now *read* rather than waited for. Both are proved in a child
   process by `eip/plugins/observer-advisor-deadline.test.mjs`, which fails on every Node
   version before the fix (the child exits 13: unsettled top-level await).

**The Node support policy follows from this.** One version is not "Node": `engines.node` is
`^22 || ^24`, the matrix is `['22', '24']` with `fail-fast: false`, and
`tests/ci-workflow-matrix.test.mjs` asserts the two lists are the same. Any other line is
**unverified** — not forbidden, just not something this project has evidence about. The runner
image is pinned to `ubuntu-24.04`, because `ubuntu-latest` moves the evidence under the project.

## Why it exists

[`FINAL-VERIFICATION.md`](FINAL-VERIFICATION.md) lists two limitations that no client-side
mechanism can remove:

1. `git push --no-verify` bypasses the hooks, and nothing client-side can prevent it.
2. The gitignored evidence file is **local, per machine and self-attested**: the machine that
   made the change says the suite passed, and no one else can inspect the record.

A server-side re-run answers both: a machine the author does not control, on a checkout the
author did not prepare. The first run proved the point by finding a defect this machine hid.

## What CI proves, and what the trailer proves

| Claim | Proved by | Not proved by |
|---|---|---|
| the suite passes on this exact tree | **CI's own re-run** of typecheck, module load, `node --test`, the gates, the release gate, cell state and the UPP conformance corpus | the trailer, which only records a local claim |
| the local run was about **this** tree | the `Verified-State` trailer, compared with `git rev-parse <commit>^{tree}` | CI, which cannot see the local run |
| the author ran the suite before committing | nothing here. The trailer is a *reference*, not an attestation | both of the above |

CI **never reads the local evidence file**: it is gitignored, and a file the author can write is
not evidence to a verifier. The workflow re-runs everything instead, and
`tests/ci-workflow.test.mjs` asserts it mentions neither the evidence directory nor
`verify:final`.

## The PRE-ARTICLE-8 policy

Article 8, the fingerprint, the hooks and the trailer all arrived in commit `b92c7c8`. Every
commit before it has no `Verified-State` trailer and never could have had one.
[`ci-trailer.mjs`](ci-trailer.mjs) therefore classifies each commit in the examined range:

| Verdict | Meaning | Effect |
|---|---|---|
| `MATCH` | the trailer names the tree the commit records | pass |
| `MISMATCH` | the trailer names a different tree (or the tree is unreadable) | **fail** |
| `MISSING` | no trailer, on a commit that is not an ancestor of the boundary | **fail** |
| `MALFORMED` | a trailer that is not `sha256:<64 hex> tree:<40 hex>` | **fail** |
| `MULTIPLE` | more than one trailer on one commit | **fail** |
| `PRE_ARTICLE_8` | an ancestor of `b92c7c8`, boundary excluded | reported, never failed |

The boundary is **the first commit that carries a trailer**, so the pre-policy set is exactly
`ancestors(b92c7c8) \ {b92c7c8}`, decided by `git merge-base --is-ancestor`. Three rules keep
this from becoming an escape hatch:

- a trailer is **never written retroactively** for an old commit — that would be fabricated
  evidence, the precise dishonesty Article 8 exists to stop;
- being pre-boundary excuses an **absent** trailer only. A malformed, doubled or mismatching
  trailer fails at any age;
- **fail closed**: a checkout that cannot resolve the boundary (a shallow clone, a fork
  without the history) excuses *nothing* — `MISSING` stays `MISSING`.

An **empty range** is not a pass either: a check that examined no commit established nothing.

## The fingerprint line is informational

CI recomputes the fingerprint of its own checkout and prints whether it equals the one in the
trailer. A difference is **expected and not a finding**: the fingerprint hashes file *bytes*,
so a different operating system, a `core.autocrlf` setting or an uncommitted working-tree
change legitimately produces a different value for the same commit. The **git tree id** is the
binding comparison — it is what the commit records, and git computes it identically
everywhere. Treating the fingerprint line as tamper detection would train a reader to ignore
the line that does mean tampering.

## How to read the job summary

Each run appends one block to the job summary ([`ci-summary.mjs`](ci-summary.mjs)):

- **commit** — the SHA actually verified. On a pull request the workflow checks out the head
  commit, not GitHub's synthetic merge commit, because the merge commit carries no trailer.
- **CI fingerprint** / **CI working tree** — what this checkout hashed to. `UNKNOWN` means the
  state could not be read, which is never a pass.
- **tests re-run here** — `N tests · N pass · N fail · N skipped · N cancelled · N todo`,
  parsed from `node --test`'s own summary ([`test-counts.mjs`](test-counts.mjs)). The six
  numbers must ADD UP, and the report is refused when they do not. **Skips are visible, not
  failures**: the polyglot conformance rows skip legitimately on a machine without a
  toolchain, and `cpp` stays UNEXECUTED. A skipped row is never counted as a pass. A
  **cancelled** row, by contrast, IS a failure: it did not run, so it established nothing.
- **trailer verdict** plus one table row per commit, with the reason in full.

## Recommended branch protection — a RECOMMENDATION, nothing was changed

No repository setting was touched by this cell, and none will be without explicit human
action. What the human may choose to enable on `main`, once a green run exists:

- require **both** matrix checks, `verify (node 22)` and `verify (node 24)` — the matrix renames
  them, and requiring only one would verify only one line;
- require a pull request before merging (so the check runs on the proposed state);
- disallow force pushes and branch deletion (a rewritten history erases the audit trail);
- **include administrators**, or the rule stops applying to the account most able to bypass it.

Until that is enabled the workflow reports; it does not block. UNKNOWN until configured.

## Running it locally

```
node tools/gates/ci-trailer.mjs                 # HEAD only (what a push checks)
node tools/gates/ci-trailer.mjs --all           # the whole history, PRE_ARTICLE_8 rows included
node tools/gates/ci-trailer.mjs <base>..<head>  # a range (what a pull request checks)
node --test tests/ci-workflow.test.mjs tests/gates-ci-trailer.test.mjs
```

VERIFIED on 2026-10-03, win32, Node 24.19.0: `HEAD` (`b92c7c8`) is `1 MATCH`; `--all` is
`10 commit(s): 1 MATCH, 9 PRE_ARTICLE_8`, exit 0.

## Pinned actions

Resolved from the official tags with read-only `gh api` on 2026-10-03. Only `actions/*`.

| Action | Tag | Commit SHA |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/setup-python` | v7.0.0 | `5fda3b95a4ea91299a34e894583c3862153e4b97` |
| `actions/setup-java` | v6.0.1 | `de7274f081f381c8f8158605e0321c36c376e2e6` |

Rust is **probed, not installed**: the `ubuntu-24.04` image documents a preinstalled Rust
toolchain, and the `toolchains present on this runner` step runs `rustc --version` before the
conformance step, so an absent compiler fails loudly instead of becoming a quiet `SKIPPED`.
Nothing is fetched with `curl`, `rustup` or a package manager. **Epistemic status:** that
`rustc` is present on this image is INFERRED from the image documentation and ENFORCED by the
probe; it is UNKNOWN until the second remote run. If the probe fails there, the honest
correction is to drop `rust` from `--require` and record it as NOT VERIFIED IN CI — never to
install a toolchain with `curl | sh`.

## Conformance in CI is REQUIRED, not merely attempted

The runner is provisioned with Python 3.12 (`setup-python`), Temurin JDK 21 (`setup-java`, via
`JAVA_HOME`) and the image's Rust toolchain, so a `SKIPPED` row there does not mean "this
machine has no toolchain" — it means **the provisioning broke**. The step therefore runs
`npm run upp:conformance -- --require python,java,rust`, and an unmet requirement exits 1
([`conformance-required.mjs`](../../eip/upp-host/conformance-required.mjs)). On a developer
machine nothing is required and a skip stays an honest, visible non-failure. `cpp` is **never**
required: its source has never been compiled anywhere in this project.

## Mutation proofs (each applied, observed red, reverted)

| Guard | Mutation | Observed red |
|---|---|---|
| the tree comparison binds | `classify` compares the fingerprint instead of the tree | `verdict · the trailer tree equals the commit tree: MATCH` + 3 git cases |
| pre-boundary never excuses a broken trailer | `classify` returns `PRE_ARTICLE_8` whenever `preArticle8` holds | `verdict · being pre-Article-8 excuses an ABSENT trailer, never a broken one` |
| fail closed on an unknown boundary | `checkRange` treats an unresolvable boundary as "everything is pre-policy" | `ci-trailer · an UNKNOWN boundary fails closed: nothing is excused` |
| counts are real, not invented | `parseTestCounts` defaults a missing field to `0` | `counts · an incomplete or unparsable summary is null, never a zero` |
| the deadline fires with nothing else holding the loop | re-add `timer.unref?.()` in `call-model.mjs` | `deadline · an adapter that never answers is REFUSED even when nothing else holds the loop` (child exits 13) |
| an already-aborted signal still settles the call | `expired` only *listens* for `abort`, never reads `aborted` | `deadline · a signal already aborted before the call refuses without reaching the adapter` (cancelled at 4 s) |
| the workflow stays least-privilege | `permissions` gains `pull-requests: write` | `workflow · the only permission granted is contents: read` |

## Limits of this cell

- The **corrected** workflow's behaviour on GitHub is UNKNOWN: only its structure was checked
  here, and the second remote run has not happened. The first run's failure is VERIFIED and
  its three causes are fixed; that the fixes are sufficient *there* is INFERRED.
- The suite now passes on Node 22 and Node 24 on win32 (VERIFIED locally). On Linux it has run
  once, and failed for the reasons above; a further platform-specific finding is possible, and
  it would be a finding to fix, not a reason to weaken a gate.
- `rustc` on the runner image: see the note under *Pinned actions*. UNKNOWN until the next run.
- CI proves the suite passes. It does not prove the change is correct, proportionate or well
  designed — those remain human review items ([`README.md`](README.md)).
