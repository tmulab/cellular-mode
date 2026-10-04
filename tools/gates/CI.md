# Independent CI verification

**Status: IMPLEMENTED LOCALLY, NOT YET RUN REMOTELY.** The workflow
[`.github/workflows/verify.yml`](../../.github/workflows/verify.yml) **has never run on
GitHub**. It runs for the first time on the first push after the human authorizes one.
Everything claimed below about its *shape* is VERIFIED by
[`tests/ci-workflow.test.mjs`](../../tests/ci-workflow.test.mjs) on this machine; everything
about its *result* is UNKNOWN until that first run exists.

## Why it exists

[`FINAL-VERIFICATION.md`](FINAL-VERIFICATION.md) lists two limitations that no client-side
mechanism can remove:

1. `git push --no-verify` bypasses the hooks, and nothing client-side can prevent it.
2. The evidence in the gitignored evidence file is **local, per machine and self-attested**:
   the same machine that made the change says the suite passed, and no one else can inspect
   the record.

A server-side re-run answers both, because it is performed by a machine the author does not
control, on a checkout the author did not prepare.

## What CI proves, and what the trailer proves

| Claim | Proved by | Not proved by |
|---|---|---|
| the suite passes on this exact tree | **CI's own re-run** of typecheck, module load, `node --test`, the gates, the release gate, cell state and the UPP conformance corpus | the trailer, which only records a local claim |
| the local run was about **this** tree | the `Verified-State` trailer, compared with `git rev-parse <commit>^{tree}` | CI, which cannot see the local run |
| the author ran the suite before committing | nothing here. The trailer is a *reference*, not an attestation | both of the above |

CI **never reads the local evidence file**. It is not in the checkout (it is gitignored), and
reading it would be worthless anyway: a file the author can write is not evidence to a
verifier. The workflow re-runs everything instead. `tests/ci-workflow.test.mjs` asserts that
the workflow mentions neither the evidence directory nor `verify:final`.

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
- **tests re-run here** — `N tests · N pass · N fail · N skipped`, parsed from `node --test`'s
  own summary ([`test-counts.mjs`](test-counts.mjs)). **Skips are visible, not failures**: the
  polyglot conformance rows skip legitimately when a toolchain is absent, and `cpp` stays
  UNEXECUTED. A skipped row is never counted as a pass.
- **trailer verdict** plus one table row per commit, with the reason in full.

## Recommended branch protection — a RECOMMENDATION, nothing was changed

No repository setting was touched by this cell, and none will be without explicit human
action. What the human may choose to enable on `main`, once a first run exists:

- require the status check named **`verify`** to pass before merging;
- require a pull request before merging (so the check runs on the proposed state);
- disallow force pushes and branch deletion (a rewritten history erases the audit trail);
- **include administrators**, otherwise the rule stops applying to the one account most able
  to bypass it;
- optionally require branches to be up to date before merging.

Until that is enabled the workflow is informative only: it reports, it does not block.
UNKNOWN until configured.

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

Rust is **probed, not installed**: `rustc` is preinstalled on `ubuntu-latest`, and the
conformance runner reports `SKIPPED` with a reason if it is absent. Nothing is fetched with
`curl`, `rustup` or a package manager.

## Mutation proofs (each applied, observed red, reverted)

| Guard | Mutation | Observed red |
|---|---|---|
| the tree comparison binds | `classify` compares the fingerprint instead of the tree | `verdict · the trailer tree equals the commit tree: MATCH` + 3 git cases |
| pre-boundary never excuses a broken trailer | `classify` returns `PRE_ARTICLE_8` whenever `preArticle8` holds | `verdict · being pre-Article-8 excuses an ABSENT trailer, never a broken one` |
| fail closed on an unknown boundary | `checkRange` treats an unresolvable boundary as "everything is pre-policy" | `ci-trailer · an UNKNOWN boundary fails closed: nothing is excused` |
| counts are real, not invented | `parseTestCounts` defaults a missing field to `0` | `counts · an incomplete or unparsable summary is null, never a zero` |
| the workflow stays least-privilege | `permissions` gains `pull-requests: write` | `workflow · the only permission granted is contents: read` |

## Limits of this cell

- The workflow's **behaviour on GitHub is UNKNOWN**. Only its structure was checked.
- `node --test` has never been executed on Linux in this repository; a platform-specific test
  may well be red on the first run. That is a finding to fix, not a reason to weaken a gate.
- CI proves the suite passes. It does not prove the change is correct, proportionate or well
  designed — those remain human review items ([`README.md`](README.md)).
